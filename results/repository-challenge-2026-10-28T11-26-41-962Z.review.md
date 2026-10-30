# First reviewed repository challenge run

Artifacts:

- [Live extraction and scripted-check replay](repository-challenge-2026-10-28T11-26-41-962Z.json)
- [Terminal policy comparison](repository-challenge-2026-10-28T11-26-41-962Z.policy-comparison.json)
- [Assessment-safety trajectory diagnostic](repository-challenge-2026-10-28T11-26-41-962Z.trajectory-review.json)
- [All-case terminal-cost bounds](repository-challenge-2026-10-28T11-26-41-962Z.cost-bounds.json)

All 24 action-target trajectories were accepted before the run. Source, review,
execution and model hashes were validated before model calls. No prompts, model
numbers or targets were changed in response to these predictions. Acceptance is
in the source-bound review overlay; it does not verify fictional findings or intent.

## Observations

- 24 cases in eight matched triplets; none skipped; 72/72 action checkpoints matched.
- Final actions: eight stipulated legitimate cases SAFE with precautions,
  eight stipulated scams FLAG, eight unknown cases HOLD.
- Eight unresolved inspections produced `unsupported_evidence`; belief was
  retained and safety HOLD remained, without smoothing or a legitimacy fallback.
- 56 recruiter annotation calls, zero candidate calls. Configured model:
  `gpt-5.6-luna`. No repositories were fetched or executed.
- Run duration: 105,107 ms; median extraction-wrapper duration: 1,830 ms. These
  do not isolate provider inference from SDK/local work or retries. Token usage
  and billed dollar costs were not captured.

## Terminal decision comparison

Costs are student-assumed relative units, not dollars. Unknown labels are excluded
from binary metrics and cost totals; unknown HOLD counts are reported separately.

| Policy | Terminal cost | SAFE on scam | FLAG on legitimate | HOLD on unknown |
| --- | ---: | ---: | ---: | ---: |
| Always SAFE | 16 | 8 | 0 | 0 |
| Always HOLD | 8 | 0 | 0 | 8 |
| Always FLAG | 8 | 0 | 8 | 0 |
| Cost-only diagnostic | 0 | 0 | 0 | 0 |
| V2 cost + safety | 0 | 0 | 0 | 8 |

Cost-only uses V2's exact extraction/check trajectory. It is an ablation, not an
independently run evidence-selection agent. V1 and an independent direct-model
baseline have not been evaluated on this challenge yet.

For all 24 cases, rather than only known labels, HOLD's assumed cost is 0.5 in
either state. V2 therefore has terminal cost **4** from its eight unknown HOLDs.
Cost-only's total lies between **0 and 16**, depending on the eight unknown states.
The other all-case bounds are always SAFE 16–32, always HOLD exactly 12, and always
FLAG 8–16. No unknown state is imputed. These bounds still exclude check cost and
cumulative actions, and they do not establish that V2 beats cost-only economically.

## What terminal cost hides

At the execution request, V2 held all 24 cases; cost-only selected SAFE on all 24
before inspection. Across events after execution was established, cost-only
selected SAFE on 48 events where inspection or assessment authorisation was still
unresolved. V2 selected SAFE on zero such events. These are correlated event
counts, not 48 independent failures or observed incidents.

The diagnostic uses the reviewed assessment contract: execution needs scoped
clean inspection and verified authorisation. Cost-only also ends SAFE on all
eight unknown cases. Excluding unknown labels from terminal cost hides that
difference. Equal terminal cost therefore does not mean equal safety-contract
compliance. Verification costs and accumulated delay are unassigned; no total
operational-cost saving is established.

## Limits and next work

The author knew the implementation. This balanced authored challenge is not an
independent holdout or representative traffic sample. Triplets share prefixes;
there are only eight families. Inspection outcomes, scopes and authorisation
are scripted. Classification can be easy once a supplied outcome arrives; the
run does not validate live inspection or real-world fraud identification.

The numerical model uses unsmoothed authored counts. Zero likelihoods and resulting
certainty are not calibrated deployment probabilities. The eight unsupported
outcomes expose numerical coverage limits despite appropriate HOLD actions.
Provider model-version resolution and repeated-run variability are not established.

All 24 introductory messages were annotated ambiguous. Replay permits scoped
conversation-only SAFE before execution; the separate live conversation runner
handles ambiguity more conservatively. Do not present this as an end-to-end
evaluation of every live branch. Keep the protocol difference explicit before
unifying runners in a later research version.

No full-agent checkpoint failure was observed. Do not invent five failures for
the course gate or relabel correct actions as mistakes. Next: evidence-matched
baseline design, failure/robustness cases, information selection/check costs,
calibration limitations, then student-written paper and discussion updates.
The Week 2 deliverable remains unfinished.
