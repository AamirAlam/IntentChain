# Repository challenge target review

Authored synthetic cases. All 24 action-target trajectories were accepted by the user on 2026-10-28: Rust 1001–1003 first, then the remaining seven triplets. The source JSON retains its original proposed metadata; the source-bound review overlay records acceptance.

The first scored replay was subsequently completed on 2026-10-28: [saved report](../../results/repository-challenge-2026-10-28T11-26-41-962Z.json). Initial review preceded that run; subsequent changes informed by these outputs must be treated as development rather than unseen evaluation.

Acceptance is recorded in [the source-bound review overlay](repository-evaluation-v1.target-reviews.json). It concerns action targets only, not verification of fictional findings or underlying labels. The source dataset is unchanged.

The code/model snapshot was recorded before authoring. This is not an independently authored holdout, and the balanced mix is not a traffic-rate estimate.

Each triplet shares the same messages through e3. Inspection outcomes and authorisation are entirely scripted. File/line references are fixture coordinates, not real source citations.

| Family | Legitimate | Scam | Unknown | Proposed action checkpoints |
| --- | --- | --- | --- | --- |
| rust-build-step | 1001 | 1002 | 1003 | e3 HOLD for all; legitimate e4 HOLD → e5 SAFE; scam e4 FLAG → e5 FLAG; unknown remains HOLD |
| python-test-discovery | 1004 | 1005 | 1006 | e3 HOLD for all; legitimate e4 HOLD → e5 SAFE; scam e4 FLAG → e5 FLAG; unknown remains HOLD |
| dotnet-build-target | 1007 | 1008 | 1009 | e3 HOLD for all; legitimate e4 HOLD → e5 SAFE; scam e4 FLAG → e5 FLAG; unknown remains HOLD |
| gradle-initialisation | 1010 | 1011 | 1012 | e3 HOLD for all; legitimate e4 HOLD → e5 SAFE; scam e4 FLAG → e5 FLAG; unknown remains HOLD |
| storybook-preview | 1013 | 1014 | 1015 | e3 HOLD for all; legitimate e4 HOLD → e5 SAFE; scam e4 FLAG → e5 FLAG; unknown remains HOLD |
| editor-task-assessment | 1016 | 1017 | 1018 | e3 HOLD for all; legitimate e4 HOLD → e5 SAFE; scam e4 FLAG → e5 FLAG; unknown remains HOLD |
| shell-bootstrap | 1019 | 1020 | 1021 | e3 HOLD for all; legitimate e4 HOLD → e5 SAFE; scam e4 FLAG → e5 FLAG; unknown remains HOLD |
| rake-assessment | 1022 | 1023 | 1024 | e3 HOLD for all; legitimate e4 HOLD → e5 SAFE; scam e4 FLAG → e5 FLAG; unknown remains HOLD |

Review each message and scripted finding in [repository-evaluation-v1.json](repository-evaluation-v1.json). Confirm whether the proposed action follows from evidence available at that event, without using the hidden label. Record any correction before the first scored model run.

Do not claim that a clean source finding alone verifies recruitment: the legitimate final SAFE also requires the scripted authorisation at e5. Unknown/missing source does not establish fraud.
