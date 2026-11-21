import { z } from 'zod';
import { parseConversation, runConversation } from '../conversation-runner.ts';
import { extractExecutionRequests } from '../execution-extractor.ts';
import type { VisibleMessage } from '../execution-extractor.ts';
import { extractWalletRequests } from '../wallet-request-extractor.ts';
import { runRepositoryInspection } from '../repository-inspection-cycle.ts';
import { calculateBinaryEntropy } from '../bayes.ts';
import {
  createConversationBeliefTracker,
  parseConversationBeliefConfig,
} from '../conversation-belief.ts';
import estimationModel from '../config/repository-belief.estimation-v1.json';

const beliefConfig = parseConversationBeliefConfig(estimationModel);

function expectedInspectionGain(prior: number): number | null {
  const outcomes = Object.values(beliefConfig.firstInspectionLikelihoods).flatMap((row) =>
    row ? [row] : [],
  );
  if (
    (['likelihoodGivenScam', 'likelihoodGivenLegitimate'] as const).some(
      (state) => Math.abs(outcomes.reduce((sum, row) => sum + row[state], 0) - 1) > 1e-9,
    )
  ) {
    return null;
  }
  const expectedEntropy = outcomes.reduce((sum, row) => {
    const scamWeight = prior * row.likelihoodGivenScam;
    const outcomeProbability = scamWeight + (1 - prior) * row.likelihoodGivenLegitimate;
    return outcomeProbability === 0
      ? sum
      : sum + outcomeProbability * calculateBinaryEntropy(scamWeight / outcomeProbability);
  }, 0);
  return Math.max(0, calculateBinaryEntropy(prior) - expectedEntropy);
}

const messageSchema = z.object({
  sender: z.enum(['recruiter', 'candidate']),
  message: z.string().trim().min(1).max(8000),
});

// Exact argument snapshots let the existing runner reconstruct state without repeating
// old API calls. Cache failures too: a later message must not silently rewrite history.
function cacheCalls<Args extends readonly unknown[], Result>(
  call: (...args: Args) => Promise<Result>,
) {
  let entries: Readonly<Record<string, Promise<Result>>> = {};
  return (...args: Args): Promise<Result> => {
    const key = JSON.stringify(args);
    if (!entries[key]) {
      entries = { ...entries, [key]: Promise.resolve().then(() => call(...args)) };
    }
    return entries[key];
  };
}

/** Keep one bounded demo chat in memory; inspection snapshots are not refreshed within a chat. */
export function createChatSession(
  dependencies: {
    extract?: typeof extractExecutionRequests;
    inspect?: typeof runRepositoryInspection;
    extractWallet?: typeof extractWalletRequests;
  } = {},
) {
  const extract = cacheCalls(dependencies.extract ?? extractExecutionRequests);
  const inspect = cacheCalls(dependencies.inspect ?? runRepositoryInspection);
  const extractWallet = cacheCalls(dependencies.extractWallet ?? extractWalletRequests);
  let messages: readonly VisibleMessage[] = [];
  let busy = false;
  return {
    append(rawMessage: unknown) {
      if (busy) {
        throw new Error('Chat is already analysing a message.');
      }
      const parsed = messageSchema.parse(rawMessage);
      const message: VisibleMessage = {
        time: `t${messages.length}`,
        sender: parsed.sender === 'recruiter' ? 'counterparty' : 'candidate',
        message: parsed.message,
      };
      const nextMessages = [...messages, message];
      if (nextMessages.length > 20 || Buffer.byteLength(JSON.stringify(nextMessages)) > 64 * 1024) {
        throw new Error('Chat limit reached. Start a new chat.');
      }
      messages = nextMessages;
      busy = true;
      const steps = (async function* () {
        try {
          const track = createConversationBeliefTracker(beliefConfig);
          let priorScam = beliefConfig.priorScam;
          let inspectionGain: number | null = null;
          for await (const step of runConversation(
            { messages: nextMessages },
            extract,
            inspect,
            undefined,
            extractWallet,
          )) {
            const { probabilistic } = track(step);
            if (step.inspection_triggered) {
              inspectionGain = expectedInspectionGain(probabilistic.distribution.scam);
            }
            if (step.time === message.time) {
              yield {
                ...step,
                reasoning: {
                  priorScam,
                  distribution: probabilistic.distribution,
                  entropyBits: probabilistic.entropyBits,
                  observedGainBits: calculateBinaryEntropy(priorScam) - probabilistic.entropyBits,
                  expectedInspectionGainBits:
                    step.inspection_triggered || 'inspection' in step ? inspectionGain : null,
                  updateStatus: probabilistic.updateStatus,
                  lastUpdatedAtEvent: probabilistic.lastUpdatedAtEvent,
                  unmodelledEvidenceEventIds: probabilistic.unmodelledEvidenceEventIds,
                  expectedCosts: probabilistic.decision.expectedCosts,
                  costAction: probabilistic.decision.costAction,
                  provenance: beliefConfig.provenance,
                },
              };
            }
            priorScam = probabilistic.distribution.scam;
          }
        } finally {
          busy = false;
        }
      })();
      return { message, steps };
    },
  };
}

/** Validate and project a bounded demo replay before any agent work. */
export function parseReplayConversation(input: unknown) {
  const messages = parseConversation(input);
  if (messages.length > 20) {
    throw new Error('Demo accepts at most 20 messages.');
  }
  return messages;
}

/** Run a fresh conversation through V2; transport and session storage stay in the demo. */
export const runReplayConversation = runConversation;
