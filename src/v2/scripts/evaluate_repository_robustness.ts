import { readFileSync, readdirSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { prepareRepositoryCases } from '../agent-v2.ts';
import { parseConversationBeliefConfig } from '../conversation-belief.ts';
import { executionInstructions, extractExecutionRequests } from '../execution-extractor.ts';
import {
  directBaselineInstructions,
  replayDirectEvidence,
  decideDirectEvidence,
  validateDirectDecision,
} from '../direct-evidence-baseline.ts';
import type { DirectDecision } from '../direct-evidence-baseline.ts';
import { replayRepositoryEvents, repositoryEventSchema } from '../repository-replay.ts';
import type { RepositoryReplayStep } from '../repository-replay.ts';
import { hashEvaluationText } from '../reviewed-evaluation.ts';
import { createReport, writeReport, describeFailure } from '../report.ts';

const SOURCE = 'data/synthesis/repository-robustness-v1.json';
const REVIEWS = 'data/synthesis/repository-robustness-v1.target-reviews.json';
const checkpointSchema = z.object({
  after_event: z.string(),
  expected_action: z.enum(['SAFE', 'HOLD', 'FLAG']),
});
const pairSchema = z.tuple([z.string(), z.string()]);
const targetSchema = z.object({
  checkpoints: z.array(checkpointSchema).min(1),
  unchanged_belief_pairs: z.array(pairSchema),
});
const sourceSchema = z.object({
  purpose: z.literal('authored_repository_robustness'),
  origin: z.literal('synthetic'),
  held_out: z.literal(false),
  check_mode: z.literal('scripted_results'),
  parent_source_file: z.string(),
  parent_source_sha256: z.string(),
  model_file: z.string(),
  model_sha256: z.string(),
  limits: z.array(z.string()),
  cases: z
    .array(
      z.object({
        evaluation_id: z.number().int(),
        assessment_artifact: z.string(),
        events: z.array(z.unknown()),
        evaluator_only: targetSchema.extend({
          ground_truth: z.literal('unknown'),
          runner_scope: z.literal('repository_replay'),
          scenario: z.string(),
          review_status: z.literal('accepted_scenario_targets'),
        }),
      }),
    )
    .min(1),
});

/** Validate scenario-level target acceptance and fixed model provenance before paid calls. */
export function prepareRobustness(
  readText: (path: string) => string = (path) => readFileSync(path, 'utf8'),
) {
  const rawSource = readText(SOURCE);
  const rawReviews = readText(REVIEWS);
  const source = sourceSchema.parse(JSON.parse(rawSource));
  const reviews = z
    .object({
      purpose: z.literal('user_review_of_robustness_scenarios'),
      source_sha256: z.string(),
      review_basis: z.string(),
      reviews: z.array(
        targetSchema.extend({
          evaluation_id: z.number().int(),
          status: z.literal('accepted_scenario_targets'),
        }),
      ),
    })
    .parse(JSON.parse(rawReviews));
  if (
    reviews.source_sha256 !== hashEvaluationText(rawSource) ||
    reviews.reviews.length !== source.cases.length ||
    new Set(reviews.reviews.map((review) => review.evaluation_id)).size !== source.cases.length
  ) {
    throw new Error('Robustness scenario reviews are incomplete or stale.');
  }
  for (const scenario of source.cases) {
    const review = reviews.reviews.find((item) => item.evaluation_id === scenario.evaluation_id);
    if (
      !review ||
      !isDeepStrictEqual(targetSchema.parse(review), targetSchema.parse(scenario.evaluator_only))
    ) {
      throw new Error(`Robustness targets do not match review for ${scenario.evaluation_id}.`);
    }
    const ids = scenario.events.map(
      (event) => z.object({ event_id: z.string() }).parse(event).event_id,
    );
    if (
      scenario.evaluator_only.unchanged_belief_pairs.some(
        ([before, after]) => !ids.includes(before) || ids.indexOf(after) <= ids.indexOf(before),
      )
    ) {
      throw new Error('Belief invariants must reference ordered, arrived events.');
    }
  }
  const rawModel = readText(source.model_file);
  if (
    hashEvaluationText(rawModel) !== source.model_sha256 ||
    hashEvaluationText(readText(source.parent_source_file)) !== source.parent_source_sha256
  ) {
    throw new Error('Fixed model or parent fixture changed; record a new experiment version.');
  }
  const model = parseConversationBeliefConfig(JSON.parse(rawModel));
  const coverage = prepareRepositoryCases(source, true);
  if (coverage.skipped.length) {
    throw new Error('Robustness evaluation cannot skip cases.');
  }
  return {
    source,
    model,
    coverage,
    reviews,
    sourceHash: hashEvaluationText(rawSource),
    reviewHash: hashEvaluationText(rawReviews),
  };
}

/** Score supplied targets separately from numerical invariants; no intent labels are inferred. */
export function scoreRobustness(
  targets: z.infer<typeof targetSchema>,
  v2: readonly RepositoryReplayStep[],
  direct: readonly { event_id: string; decision: { action: string; scope: string } | null }[],
) {
  return {
    checkpoints: targets.checkpoints.map((target) => {
      const step = v2.find((item) => item.event_id === target.after_event);
      const baseline = direct.find((item) => item.event_id === target.after_event)?.decision;
      return {
        ...target,
        v2_action: step?.recommendation.action ?? null,
        direct_action: baseline?.action ?? null,
        v2_match:
          step?.recommendation.action === target.expected_action &&
          step.recommendation.scope === 'repository_execution',
        direct_match:
          baseline?.action === target.expected_action && baseline.scope === 'repository_execution',
      };
    }),
    belief_invariants: targets.unchanged_belief_pairs.map(([before, after]) => {
      const prior = v2.find((item) => item.event_id === before)?.probabilistic?.belief
        .scamProbability;
      const posterior = v2.find((item) => item.event_id === after)?.probabilistic?.belief
        .scamProbability;
      return {
        before,
        after,
        before_probability: prior ?? null,
        after_probability: posterior ?? null,
        passed:
          prior !== undefined && posterior !== undefined && Math.abs(prior - posterior) < 1e-12,
      };
    }),
  };
}

type CaseRun = {
  evaluation_id: number;
  scenario: string;
  v2: RepositoryReplayStep[];
  direct: { event_id: string; candidate_context_only: boolean; decision: DirectDecision | null }[];
  score: ReturnType<typeof scoreRobustness> | null;
};

/** Reuse a completed, source/prompt/model-matched baseline; validate every arrived citation again. */
export function loadFrozenBaseline(
  path: string,
  prepared: ReturnType<typeof prepareRobustness>,
  readText: (path: string) => string = (path) => readFileSync(path, 'utf8'),
) {
  const raw = readText(path);
  const report = z
    .object({
      status: z.literal('complete'),
      source_sha256: z.string(),
      protocol_file: z.string(),
      protocol_sha256: z.string(),
      results: z.array(
        z.object({
          evaluation_id: z.number().int(),
          direct: z.array(
            z.object({
              event_id: z.string(),
              candidate_context_only: z.boolean(),
              decision: z.unknown(),
            }),
          ),
        }),
      ),
    })
    .parse(JSON.parse(raw));
  const rawProtocol = readText(report.protocol_file);
  if (hashEvaluationText(rawProtocol) !== report.protocol_sha256) {
    throw new Error('Saved baseline protocol hash changed.');
  }
  const protocol = z
    .object({
      source_sha256: z.string(),
      review_sha256: z.string(),
      model: z.string(),
      belief_configuration: z.unknown(),
      baseline_prompt_sha256: z.string(),
      files: z.record(z.string(), z.string()),
    })
    .parse(JSON.parse(rawProtocol));
  const modulePath = 'src/v2/direct-evidence-baseline.ts';
  if (
    report.source_sha256 !== prepared.sourceHash ||
    protocol.source_sha256 !== prepared.sourceHash ||
    protocol.review_sha256 !== prepared.reviewHash ||
    protocol.model !== (process.env.V2_ANNOTATION_MODEL ?? 'gpt-5.6-luna') ||
    !isDeepStrictEqual(protocol.belief_configuration, prepared.model) ||
    protocol.baseline_prompt_sha256 !== hashEvaluationText(directBaselineInstructions) ||
    protocol.files[modulePath] !== hashEvaluationText(readText(modulePath)) ||
    !isDeepStrictEqual(
      report.results.map((item) => item.evaluation_id),
      prepared.source.cases.map((item) => item.evaluation_id),
    )
  ) {
    throw new Error('Saved baseline must match cases, reviews, model, prompt and baseline code.');
  }
  const results = report.results.map((row) => {
    const events = prepared.source.cases
      .find((item) => item.evaluation_id === row.evaluation_id)!
      .events.map((event) => repositoryEventSchema.parse(event));
    if (
      !isDeepStrictEqual(
        row.direct.map((step) => step.event_id),
        events.map((event) => event.event_id),
      )
    ) {
      throw new Error('Saved baseline is missing ordered event outputs.');
    }
    const direct = row.direct.map((step, index) => {
      const event = events[index];
      if (
        step.candidate_context_only !==
        (event.kind === 'message' && event.agent_input.sender === 'candidate')
      ) {
        throw new Error('Saved baseline candidate-call markers do not match the source.');
      }
      return {
        ...step,
        decision: validateDirectDecision(step.decision, events.slice(0, index + 1)),
      };
    });
    return { evaluation_id: row.evaluation_id, direct };
  });
  return { path, sha256: hashEvaluationText(raw), results };
}

/** Run paired sequential replays with scripted checks; snapshot code before calls and retain partial failures. */
export async function runRobustness(args: readonly string[]) {
  const dryRun = args.at(-1) === '--dry-run';
  const options = dryRun ? args.slice(0, -1) : args;
  if (!(
    options.length === 0 ||
    (options.length === 2 && options[0] === '--baseline-report' && !options[1].startsWith('--'))
  )) {
    throw new Error(
      'Use evaluate_repository_robustness.ts [--baseline-report COMPLETED_REPORT.json] [--dry-run].',
    );
  }
  const prepared = prepareRobustness();
  const baseline = options.length ? loadFrozenBaseline(options[1], prepared) : undefined;
  const { source, model, coverage } = prepared;
  const directCalls = baseline
    ? 0
    : source.cases.reduce(
        (sum, scenario) =>
          sum +
          scenario.events.filter(
            (raw) =>
              z
                .object({
                  kind: z.string(),
                  agent_input: z.object({ sender: z.string().optional() }),
                })
                .parse(raw).agent_input.sender !== 'candidate',
          ).length,
        0,
      );
  if (dryRun) {
    console.log(
      `Ready: ${source.cases.length} reviewed scenarios; V2 ${coverage.plannedMessageCalls} calls; direct ${directCalls} calls; zero candidate calls. No API calls or source fetches.`,
    );
    return;
  }
  const codeFiles = [
    ...readdirSync('src/v2')
      .filter((name) => name.endsWith('.ts'))
      .map((name) => `src/v2/${name}`),
    __filename,
    'package.json',
    'pnpm-lock.yaml',
  ];
  const protocol = {
    purpose: 'paired_repository_robustness_protocol',
    source_file: SOURCE,
    source_sha256: prepared.sourceHash,
    review_sha256: prepared.reviewHash,
    model: process.env.V2_ANNOTATION_MODEL ?? 'gpt-5.6-luna',
    belief_configuration: model,
    files: Object.fromEntries(
      codeFiles.map((path) => [path, hashEvaluationText(readFileSync(path, 'utf8'))]),
    ),
    extraction_prompt_sha256: hashEvaluationText(executionInstructions),
    baseline_prompt_sha256: hashEvaluationText(directBaselineInstructions),
    baseline_origin: baseline
      ? { mode: 'reused_completed_run', report: baseline.path, sha256: baseline.sha256 }
      : { mode: 'live_in_this_run' },
    review_basis: prepared.reviews.review_basis,
    limits: [
      ...source.limits,
      'Research replay only, not the single-inspection live conversation runner. Model-call budgets differ; no token, dollar or total-operational-cost comparison.',
    ],
  };
  const protocolFile = createReport('repository-robustness-protocol', protocol);
  const started = Date.now();
  let rows: CaseRun[] = [];
  let timings: { system: string; evaluation_id: number; duration_ms: number; status: string }[] =
    [];
  const reportFile = createReport('repository-robustness', {
    status: 'running',
    protocol_file: protocolFile,
  });
  const save = (status: string, error?: ReturnType<typeof describeFailure>) =>
    writeReport(reportFile, {
      purpose: 'paired_repository_robustness_run',
      status,
      protocol_file: protocolFile,
      protocol_sha256: hashEvaluationText(readFileSync(protocolFile, 'utf8')),
      source_file: SOURCE,
      source_sha256: prepared.sourceHash,
      results: rows,
      model_calls: timings,
      duration_ms: Date.now() - started,
      ...(error ? { error } : {}),
    });
  const timeCall = async <T>(system: string, id: number, call: () => Promise<T>) => {
    const start = Date.now();
    let status = 'failed';
    try {
      const result = await call();
      status = 'complete';
      return result;
    } finally {
      timings = [
        ...timings,
        { system, evaluation_id: id, duration_ms: Date.now() - start, status },
      ];
    }
  };
  console.log(`Paired robustness run; protocol ${protocolFile}; report ${reportFile}`);
  try {
    for (const scenario of source.cases) {
      let current: CaseRun = {
        evaluation_id: scenario.evaluation_id,
        scenario: scenario.evaluator_only.scenario,
        v2: [],
        direct:
          baseline?.results.find((item) => item.evaluation_id === scenario.evaluation_id)?.direct ??
          [],
        score: null,
      };
      rows = [...rows, current];
      for await (const step of replayRepositoryEvents(
        scenario.events,
        scenario.assessment_artifact,
        (messages) =>
          timeCall('v2', scenario.evaluation_id, () => extractExecutionRequests(messages)),
        model,
      )) {
        current = { ...current, v2: [...current.v2, step] };
        rows = [...rows.slice(0, -1), current];
        save('running');
      }
      if (!baseline) {
        for await (const step of replayDirectEvidence(scenario.events, (events) =>
          timeCall('direct', scenario.evaluation_id, () => decideDirectEvidence(events)),
        )) {
          current = { ...current, direct: [...current.direct, step] };
          rows = [...rows.slice(0, -1), current];
          save('running');
        }
      }
      const score = scoreRobustness(scenario.evaluator_only, current.v2, current.direct);
      rows = [...rows.slice(0, -1), { ...current, score }];
      save('running');
      console.log(
        `${scenario.evaluation_id} ${scenario.evaluator_only.scenario}: V2 ${score.checkpoints.filter((item) => item.v2_match).length}/${score.checkpoints.length}; direct ${score.checkpoints.filter((item) => item.direct_match).length}/${score.checkpoints.length}; belief ${score.belief_invariants.filter((item) => item.passed).length}/${score.belief_invariants.length}`,
      );
    }
    save('complete');
  } catch (error) {
    save('stopped_on_error', describeFailure(error));
    throw new Error(`Robustness run stopped; partial report preserved: ${reportFile}`, {
      cause: error,
    });
  }
  console.log(`Complete: ${reportFile}`);
  return reportFile;
}

if (require.main === module) {
  runRobustness(process.argv.slice(2)).catch((error) => {
    console.error(describeFailure(error).message);
    // eslint-disable-next-line no-restricted-syntax -- CLI exit status is a process boundary side effect.
    process.exitCode = 1;
  });
}
