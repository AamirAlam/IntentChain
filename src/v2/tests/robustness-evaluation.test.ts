import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  prepareRobustness,
  scoreRobustness,
  loadFrozenBaseline,
} from '../scripts/evaluate_repository_robustness.ts';
import type { RepositoryReplayStep } from '../repository-replay.ts';

test('frozen baseline reuse requires a completed compatible protocol and exact arrived citations', () => {
  const path = 'results/repository-robustness-2026-10-30T10-01-13-777Z.json';
  const prepared = prepareRobustness();
  const baseline = loadFrozenBaseline(path, prepared);
  assert.equal(baseline.results.length, 6);
  assert.equal(baseline.results[0].direct.at(-1)?.decision.action, 'HOLD');
  assert.throws(
    () =>
      loadFrozenBaseline(path, prepared, (file) => {
        const raw = readFileSync(file, 'utf8');
        return file.includes('repository-robustness-protocol') ? raw + '\n' : raw;
      }),
    /protocol hash changed/,
  );
  assert.throws(
    () => loadFrozenBaseline(path, { ...prepared, sourceHash: '0'.repeat(64) }),
    /must match/,
  );
});

test('robustness preflight binds scenario acceptance to exact source and fixed model bytes', () => {
  const prepared = prepareRobustness();
  assert.equal(prepared.coverage.selected.length, 6);
  assert.equal(prepared.coverage.plannedMessageCalls, 16);
  assert.equal(prepared.coverage.skipped.length, 0);
  assert.ok(prepared.source.cases.every((item) => item.evaluator_only.ground_truth === 'unknown'));
  const read = (path: string) => readFileSync(path, 'utf8');
  assert.throws(
    () =>
      prepareRobustness((path) => {
        const raw = read(path);
        return path.endsWith('repository-robustness-v1.json') ? raw + '\n' : raw;
      }),
    /stale/,
  );
  assert.throws(
    () =>
      prepareRobustness((path) => {
        const raw = read(path);
        return path === prepared.source.model_file ? raw + '\n' : raw;
      }),
    /Fixed model/,
  );
});

test('robustness scoring treats missing outputs and scope mismatches as failures without changing targets', () => {
  const report: { results: { evaluation_id: number; step: RepositoryReplayStep }[] } = JSON.parse(
    readFileSync('results/repository-challenge-2026-10-28T11-26-41-962Z.json', 'utf8'),
  );
  const steps = report.results.filter((row) => row.evaluation_id === 1001).map((row) => row.step);
  const targets = {
    checkpoints: [{ after_event: 'e5', expected_action: 'SAFE' as const }],
    unchanged_belief_pairs: [['e4', 'e5'] as [string, string]],
  };
  const score = scoreRobustness(targets, steps, [
    { event_id: 'e5', decision: { action: 'SAFE', scope: 'conversation_only' } },
  ]);
  assert.equal(score.checkpoints[0].v2_match, true);
  assert.equal(score.checkpoints[0].direct_match, false);
  assert.equal(score.belief_invariants[0].passed, true);
  const missing = scoreRobustness(targets, [], []);
  assert.equal(missing.checkpoints[0].v2_match, false);
  assert.equal(missing.checkpoints[0].direct_match, false);
  assert.equal(missing.belief_invariants[0].passed, false);
  assert.equal(targets.checkpoints[0].expected_action, 'SAFE');
});
