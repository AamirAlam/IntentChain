export type RepositoryAssessment = {
  readonly executionRequested: boolean;
  readonly inspection:
    'pending' | 'unresolved' | 'no_harmful_behaviour_found' | 'harmful_behaviour_found';
  readonly assessmentAuthorisation: 'unresolved' | 'verified';
};

export type RepositoryPolicyMode = 'on_the_go' | 'legacy_authorisation_required';

// The reviewed repository-execution rules, not the full cost-based V2 policy.
// Inputs concern one assessment and the inspected artifact; new artifacts need new checks.
/** Recommend precautions for one assessment. The default preserves the historical research protocol;
 * live workflows explicitly use on_the_go, where sender verification is optional context. */
export function recommendRepositoryAction(
  state: RepositoryAssessment,
  mode: RepositoryPolicyMode = 'legacy_authorisation_required',
) {
  if (
    typeof state.executionRequested !== 'boolean' ||
    !['pending', 'unresolved', 'no_harmful_behaviour_found', 'harmful_behaviour_found'].includes(
      state.inspection,
    ) ||
    !['unresolved', 'verified'].includes(state.assessmentAuthorisation) ||
    !['on_the_go', 'legacy_authorisation_required'].includes(mode)
  ) {
    throw new Error('Invalid repository assessment.');
  }
  if (state.inspection === 'harmful_behaviour_found') {
    return {
      action: 'FLAG',
      reason: 'Concrete harmful behaviour found; do not execute the repository.',
    };
  }
  if (!state.executionRequested) {
    return { action: null, reason: 'No repository-execution recommendation is required.' };
  }
  if (state.inspection !== 'no_harmful_behaviour_found') {
    return {
      action: 'HOLD',
      reason: 'Avoid execution while repository inspection is pending or unresolved.',
    };
  }
  if (mode === 'legacy_authorisation_required' && state.assessmentAuthorisation !== 'verified') {
    return { action: 'HOLD', reason: 'Assessment authorisation remains unresolved.' };
  }
  return {
    action: 'SAFE',
    reason:
      mode === 'on_the_go'
        ? 'Proceed with precautions only within the inspected repository scope. No harmful behaviour was found; sender identity and hiring legitimacy are not established by this check.'
        : 'Continue with precautions; inspection found no harmful behaviour within its scope and assessment authorisation is verified.',
    precautions: [
      'Use an appropriately isolated environment without personal credentials or sensitive files.',
      ...(mode === 'on_the_go'
        ? [
            'Use only the inspected revision and command. This assessment covers repository-controlled code, not third-party package implementations.',
          ]
        : []),
      'Reassess new instructions or changed artifacts not covered by the checks.',
    ],
  };
}
