import { loadFixture, collectSteps } from './fixtures.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseConversationBeliefConfig } from '../conversation-belief.ts';
import { replayRepositoryEvents } from '../repository-replay.ts';
import type { RepositoryReplayStep } from '../repository-replay.ts';
import type { ReplayBeliefConfig } from '../repository-replay.ts';
import type { ExecutionAnnotation, VisibleMessage } from '../execution-extractor.ts';

const fixture = loadFixture();

test('clearance fix preserves original challenge actions with cached historical annotations', async () => {
  const challenge = loadFixture('repository-evaluation-v1.json');
  const model = parseConversationBeliefConfig(
    JSON.parse(readFileSync('src/v2/config/repository-belief.estimation-v1.json', 'utf8')),
  );
  const historical: { results: { evaluation_id: number; step: RepositoryReplayStep }[] } =
    JSON.parse(readFileSync('results/repository-challenge-2026-10-28T11-26-41-962Z.json', 'utf8'));
  let checked = 0;
  for (const scenario of challenge.cases) {
    const steps = await collectSteps(
      replayRepositoryEvents(
        scenario.events,
        scenario.assessment_artifact!,
        async (messages) => {
          const annotation = historical.results.find(
            (row) =>
              row.evaluation_id === scenario.evaluation_id &&
              row.step.event_id === messages.at(-1)!.time,
          )?.step.annotation;
          assert.ok(annotation, 'Every recruiter prefix must have a saved annotation.');
          return annotation;
        },
        model,
      ),
    );
    for (const target of scenario.evaluator_only.checkpoints) {
      assert.equal(
        steps.find((step) => step.event_id === target.after_event)?.recommendation.action,
        target.expected_action,
        `${scenario.evaluation_id} ${target.after_event}`,
      );
      checked++;
    }
  }
  assert.equal(checked, 72);
});
let calls: VisibleMessage[][] = [];
const stub = async (messages: readonly VisibleMessage[]): Promise<ExecutionAnnotation> => {
  calls = [...calls, structuredClone([...messages])];
  const request = messages.find(
    (message) => message.sender === 'counterparty' && message.message.includes('run it locally'),
  );
  return request
    ? {
        status: 'present',
        first_explicit_request_message: request.time,
        supporting_message: request.time,
        quote: 'run it locally',
        reason: 'Test annotation for the visible request.',
      }
    : {
        status: 'absent_so_far',
        first_explicit_request_message: null,
        supporting_message: null,
        quote: null,
        reason: 'No request visible in this test prefix.',
      };
};
async function collect(events: readonly unknown[]) {
  return collectSteps(replayRepositoryEvents(events, fixture.assessment_artifact, stub));
}

test('scoped inspection preserves evidence, rejects incomplete clearance, and feeds safety rules', async () => {
  const events = fixture.cases[0].events;
  const event = events[3];
  assert.ok(event.kind === 'check_result' && event.agent_input.check === 'repository_inspection');
  const scope = {
    requested_action: 'npm start',
    artifact_revision: 'synthetic-revision-1',
    inspected_files: ['package.json'],
    findings: [],
    gaps: ['Referenced startup script could not be inspected.'],
  };
  const withInspection = (inspection: unknown) =>
    events.map((item, index) => (index === 3 ? { ...event, agent_input: inspection } : item));
  const incomplete = { ...event.agent_input, scope };
  await assert.rejects(collect(withInspection(incomplete)), /unresolved execution-path gaps/);
  const unresolved = { ...incomplete, outcome: 'unresolved' };
  const heldSteps = await collect(withInspection(unresolved));
  assert.equal(heldSteps.at(-1)?.recommendation.action, 'HOLD');
  assert.deepEqual(heldSteps.at(-1)?.inspectionScope, scope);

  const unsupportedHarm = { ...incomplete, outcome: 'harmful_behaviour_found' };
  await assert.rejects(collect(withInspection(unsupportedHarm)), /cited harmful findings/);
  const finding = {
    file: 'package.json',
    start_line: 4,
    end_line: 6,
    behaviour: 'Synthetic fixture: credential access and transmission to unrelated server.',
    harmful: true,
  };
  const harmful = { ...unsupportedHarm, scope: { ...scope, findings: [finding] } };
  const flaggedSteps = await collect(withInspection(harmful));
  assert.equal(flaggedSteps.at(-1)?.recommendation.action, 'FLAG');
  const wrongFile = {
    ...harmful,
    scope: { ...scope, findings: [{ ...finding, file: 'not-inspected.js' }] },
  };
  await assert.rejects(collect(withInspection(wrongFile)), /inspected file/);

  const clean = {
    ...incomplete,
    outcome: 'no_harmful_behaviour_found',
    scope: { ...scope, gaps: [] },
  };
  const clearedSteps = await collect(withInspection(clean));
  assert.equal(clearedSteps[3].recommendation.action, 'HOLD');
  assert.equal(clearedSteps.at(-1)?.recommendation.action, 'SAFE');
});

test('replay uses only arrived messages, ignores supplied annotations, and then applies check results', async () => {
  for (const scenario of fixture.cases) {
    calls = [];
    // Reviewer metadata must neither drive policy nor enter extraction.
    const events = scenario.events.map((event) =>
      event.kind !== 'message'
        ? event
        : {
            ...event,
            reviewed_annotations: { code_execution_request: 'absent_so_far' },
            agent_input: { ...event.agent_input, ground_truth: 'scam' },
          },
    );
    const steps = await collect(events);
    let messageCount = 0;
    let recruiterPrefixes: number[] = [];
    for (const event of events) {
      if (event.kind === 'message') {
        messageCount += 1;
        if (event.agent_input.sender === 'counterparty') {
          recruiterPrefixes = [...recruiterPrefixes, messageCount];
        }
      }
    }
    assert.deepEqual(
      calls.map((messages) => messages.length),
      recruiterPrefixes,
    );
    assert.equal(steps[1].annotation, null);
    assert.ok(
      calls.every((messages) =>
        messages.every(
          (message) => Object.keys(message).toSorted().join(',') === 'message,sender,time',
        ),
      ),
    );
    assert.equal(steps[0].assessment.executionRequested, false);
    assert.equal(steps[2].recommendation.action, 'HOLD');
    for (const expected of scenario.evaluator_only.checkpoints) {
      assert.equal(
        steps.find((step) => step.event_id === expected.after_event)?.recommendation.action,
        expected.expected_action,
      );
    }
  }
});

test('wrong-artifact, premature, and repeated check events are rejected', async () => {
  const events = fixture.cases[0].events;
  const wrong = events.map((event, index) =>
    index !== 3
      ? event
      : {
          ...event,
          agent_input: {
            ...event.agent_input,
            artifact: 'https://other.example.invalid/repository',
          },
        },
  );
  await assert.rejects(collect(wrong), /repository visible/);
  const lookalike = events.map((event, index) =>
    index !== 2 || event.kind !== 'message'
      ? event
      : {
          ...event,
          agent_input: {
            ...event.agent_input,
            message: event.agent_input.message.replace(
              fixture.assessment_artifact,
              fixture.assessment_artifact + '-other',
            ),
          },
        },
  );
  await assert.rejects(collect(lookalike), /repository visible/);
  await assert.rejects(collect([events[3], ...events.slice(0, 3)]), /earlier event/);
  await assert.rejects(collect([...events, events[3]]), /Duplicate event/);
});

test('a later clean result cannot erase an observed harmful finding', async () => {
  const scam = fixture.cases[1];
  const clean = { ...fixture.cases[0].events[3], event_id: 'e5', requested_after_event: 'e4' };
  const steps = await collect([...scam.events, clean]);
  assert.equal(steps[3].recommendation.action, 'FLAG');
  assert.equal(steps[4].recommendation.action, 'FLAG');
  assert.equal(steps[2].assessment.inspection, 'pending');
});

// Reviewed in-sample exercise configuration; not deployment estimates.
const exerciseConfig: ReplayBeliefConfig = {
  priorScam: 11 / 95,
  executionLikelihoods: { likelihoodGivenScam: 6 / 11, likelihoodGivenLegitimate: 21 / 84 },
  firstInspectionLikelihoods: {
    'repository_inspection:unresolved': {
      likelihoodGivenScam: 1 / 6,
      likelihoodGivenLegitimate: 1 / 21,
    },
    'repository_inspection:no_harmful_behaviour_found': {
      likelihoodGivenScam: 1 / 6,
      likelihoodGivenLegitimate: 20 / 21,
    },
  },
};

test('later recruiter requests cannot reuse earlier clearance or reauthorise the same replay', async () => {
  const approved = fixture.cases[0].events;
  const authorisation = approved[4];
  assert.equal(authorisation.kind, 'check_result');
  const events = [
    ...approved,
    { event_id: 'e6', kind: 'message', agent_input: { sender: 'candidate', message: 'Thanks.' } },
    {
      event_id: 'e7',
      kind: 'message',
      agent_input: {
        sender: 'counterparty',
        message: 'Please pull revision B and run it locally. Revision B has not been inspected.',
      },
    },
    { ...authorisation, event_id: 'e8', requested_after_event: 'e7' },
  ];
  for (const config of [undefined, exerciseConfig]) {
    const steps = await collectSteps(
      replayRepositoryEvents(events, fixture.assessment_artifact, stub, config),
    );
    assert.equal(steps[4].recommendation.action, 'SAFE');
    assert.equal(steps[5].recommendation.action, 'SAFE');
    assert.equal(steps[5].annotation, null);
    assert.equal(steps[6].recommendation.action, 'HOLD');
    assert.equal(steps[7].recommendation.action, 'HOLD');
    assert.equal(steps[7].assessment.assessmentAuthorisation, 'unresolved');
    assert.match(steps[6].recommendation.reason, /new assessment/);
    if (config) {
      assert.equal(
        steps[6].probabilistic!.belief.scamProbability,
        steps[4].probabilistic!.belief.scamProbability,
      );
    }
  }
});

test('configured replay combines sequential beliefs with safety constraints without future or repeated updates', async () => {
  for (const scenario of fixture.cases) {
    const steps = await collectSteps(
      replayRepositoryEvents(scenario.events, fixture.assessment_artifact, stub, exerciseConfig),
    );
    assert.ok(Math.abs(steps[0].probabilistic!.belief.scamProbability - 11 / 95) < 1e-12);
    assert.equal(steps[0].recommendation.scope, 'conversation_only');
    assert.match(steps[0].recommendation.guidance, /execution has not been authorised/);
    assert.equal(steps[0].probabilistic!.probabilityMeaning, 'configured_prior');
    assert.equal(steps[0].probabilistic!.lastUpdatedAtEvent, null);
    assert.deepEqual(steps[0].probabilistic!.unmodelledEvidenceEventIds, []);
    assert.ok(Math.abs(steps[2].probabilistic!.belief.scamProbability - 2 / 9) < 1e-12);
    assert.equal(steps[2].recommendation.action, 'HOLD');
    assert.equal(steps[2].recommendation.scope, 'repository_execution');
    assert.equal(steps[2].probabilistic!.lastUpdatedAtEvent, 'e3');
    for (const expected of scenario.evaluator_only.checkpoints) {
      assert.equal(
        steps.find((step) => step.event_id === expected.after_event)?.recommendation.action,
        expected.expected_action,
      );
    }
    if (scenario.evaluation_id === 101) {
      assert.ok(Math.abs(steps[3].probabilistic!.belief.scamProbability - 1 / 21) < 1e-12);
      assert.strictEqual(steps[4].probabilistic!.belief, steps[3].probabilistic!.belief);
      assert.equal(steps[4].probabilistic!.updateStatus, 'unmodelled_evidence');
      assert.ok(steps[4].recommendation.precautions?.length);
      assert.equal(steps[4].recommendation.scope, 'repository_execution');
      assert.equal(steps[4].probabilistic!.lastUpdatedAtEvent, 'e4');
      assert.deepEqual(steps[4].probabilistic!.unmodelledEvidenceEventIds, ['e5']);
      assert.deepEqual(steps[3].probabilistic!.unmodelledEvidenceEventIds, []);
    }
    if (scenario.evaluation_id === 114) {
      assert.ok(Math.abs(steps[3].probabilistic!.belief.scamProbability - 0.5) < 1e-12);
    }
    if (scenario.evaluation_id === 115) {
      assert.equal(steps[4].probabilistic!.updateStatus, 'unmodelled_evidence');
      assert.equal(steps[5].probabilistic!.updateStatus, 'duplicate_evidence');
      assert.equal(steps[6].probabilistic!.updateStatus, 'unmodelled_followup_inspection');
      assert.strictEqual(steps[6].probabilistic!.belief, steps[2].probabilistic!.belief);
      assert.deepEqual(steps[4].probabilistic!.unmodelledEvidenceEventIds, ['e4', 'e5']);
      assert.deepEqual(steps[5].probabilistic!.unmodelledEvidenceEventIds, ['e4', 'e5']);
      assert.deepEqual(steps[6].probabilistic!.unmodelledEvidenceEventIds, ['e4', 'e5', 'e7']);
      assert.equal(steps[6].probabilistic!.lastUpdatedAtEvent, 'e3');
      assert.match(steps[6].recommendation.guidance, /do not execute/i);
    }
  }
});

test('a later different inspection outcome does not reuse first-inspection likelihoods', async () => {
  const unresolved = structuredClone(
    fixture.cases.find((item) => item.evaluation_id === 114)!.events,
  );
  const clean = { ...fixture.cases[0].events[3], event_id: 'e6', requested_after_event: 'e5' };
  let steps: RepositoryReplayStep[] = [];
  for await (const step of replayRepositoryEvents(
    [...unresolved, clean],
    fixture.assessment_artifact,
    stub,
    exerciseConfig,
  )) {
    steps = [...steps, step];
  }
  assert.equal(steps[5].probabilistic!.updateStatus, 'unmodelled_followup_inspection');
  assert.strictEqual(steps[5].probabilistic!.belief, steps[3].probabilistic!.belief);
  assert.equal(steps[5].recommendation.action, 'HOLD'); // 50% tie remains HOLD
});
