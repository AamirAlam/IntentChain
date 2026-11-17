# V2 CLI reference

Run commands from the project root. For the overview and quick start, see the
[project README](../../README.md); for architecture and research assumptions, see
the [V2 guide](README.md).

## Entry points


For the local chat UI and streaming API, run `npm run demo:v2` and open
**http://127.0.0.1:3210**. See the [V2 README](README.md) for demo limits,
API events, and the distinction between the live safety rules and the separate
probability/cost modules.

The V2 entry point is `src/v2/agent-v2.ts`, whose exported `main()` loads the current four-case repository fixture, configures optional synthetic beliefs, coordinates sequential replay and writes evaluation results. `npm start` continues to run V1.

```bash
npm run start:v2 -- --synthetic-bayes --dry-run
```

Remove `--dry-run` to call the LLM and evaluate the four cases. Inspection and authorisation findings remain scripted. `--synthetic-bayes` explicitly enables the reviewed exercise configuration; without it the original repository rules are used. The existing `evaluate:repository-replay` command delegates to the same entry function.

V2 reports include recommendation `scope` and `guidance`. Early SAFE permits conversation only; repository execution requires the configured checks and precautions. The displayed probability is the **last modelled scam belief**. `lastUpdatedAtEvent` identifies its latest numerical update and `unmodelledEvidenceEventIds` lists observations not incorporated into that probability, even when safety rules act on them. Schema version 2 adds these fields; older reports are preserved.

To evaluate the repository-compatible subset of the 100-case development benchmark:

```bash
npm run start:v2 -- --benchmark --synthetic-bayes --dry-run
```

The current selection is 28 supported cases and 72 explicitly skipped cases, with 65 planned recruiter-message API calls. Remove `--dry-run` for the paid LLM run. Preflight validates selected event schemas, artifact references, event order and checkpoint targets. Reports record coverage, skipped IDs/reasons and proposed-target IDs. The synthetic likelihoods are an explicit exercise snapshot; this is not held-out accuracy or a full 100-case result.

### Scoped repository inspection records

Repository inspection events may now include `agent_input.scope` with
`requested_action`, `artifact_revision`, `inspected_files`, `findings`, and `gaps`.
Each finding records `file`, `start_line`, `end_line`, `behaviour`, and `harmful`.
Citations must reference inspected files. A scoped clean outcome requires at
least one inspected file and no relevant uninspected execution paths. Concrete
harm requires a cited harmful finding; missing in-scope local code or exhausted
review budgets should be recorded as gaps with an unresolved outcome. Clean inspection
still requires verified assessment authorisation in the historical research replay.
The live on-the-go policy permits scoped precautions after completed inspection,
without requiring independent company confirmation.

The replay preserves the latest scope in `inspectionScope` for auditing. Existing
scripted fixtures without scope remain supported. Schema validation checks record
consistency, not the truth of findings or completeness of dependency tracing.
A bounded local-file inspector is available as described below. Manual-review record workflows are available below; automatic review
scheduling is not implemented. Likelihoods and decision costs are unchanged.


### Live read-only repository inspection

```sh
npm run start:v2 -- --inspect-repo https://github.com/AamirAlam/portfolio-app --action "npm install && npm run dev"
# Existing local snapshots are also supported:
npm run start:v2 -- --inspect-local /path/to/separate-snapshot --action "npm start"
```

Public HTTPS GitHub and Bitbucket Cloud repository root URLs are supported.
The fetcher resolves the default branch to a commit, reads source through the
provider API, and sends bounded source text to the configured LLM. The requested
command is data: it is never executed. No clone, install, archive extraction,
program download, submodule or LFS fetch occurs. Remote source stays in memory;
there is no checkout to clean up. Only timestamped audit reports are retained.

Inspection follows relevant file references for up to 4 model calls, 24 paths,
32 KiB per file and 128 KiB of source text. Fetching is limited to 60 requests,
3 MB of responses and a 120-second fetch window, with 10-second request timeouts.
Redirects, symlinks, non-provider hosts and private/tool paths are refused.
Private repositories, missing source, malformed responses, API failures, missing
required files and budget limits remain unresolved. Local snapshots must be
stable; the local reader is not an OS sandbox against concurrent modification.

The automated result is one of:

- `harmful_behaviour_found`: a model-identified harmful behaviour has exact
  file/line/quote evidence. The policy recommends FLAG. This is an automated
  assessment, not independently confirmed ground truth.
- `no_harmful_behaviour_found`: the model reports complete coverage of the
  requested scope, with files inspected and no unresolved gaps. This is scoped
  static analysis, not proof that the entire repository or recruiter is safe.
- `unresolved`: incomplete coverage or review failure. The policy keeps HOLD and
  records manual review as a candidate, with the user's assumed 30-minute effort.

Harmful findings persist across review rounds. Third-party package verification is
outside the current repository-controlled-code assessment; it is disclosed as a
limitation rather than an automatic coverage gap. Repository-defined scripts,
local imports and observable payload-loading behaviour remain in scope.

The URL CLI does not establish sender identity or assessment authorisation. Under
the current on-the-go policy, completed scoped-clean inspection permits proceeding
with precautions for that revision/command; identity verification is optional
context. Incomplete source remains HOLD and concrete harm requires FLAG. It does
not invent a scam probability or a review-value estimate.
Conversation-driven URL extraction and automatic scheduling of checks are not
part of this CLI. No dataset labels are edited from inspection output.

Provider API references: [GitHub Git trees](https://docs.github.com/en/rest/git/trees),
[GitHub commits](https://docs.github.com/en/rest/commits/commits), and
[Bitbucket source](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-source/).

The 2026-10-14 live portfolio-app run inspected 19 files at commit
`ac1280fab0288b88f692d6dc2a64badaa476abbd`, with 4 model calls. It reported no harmful
findings but unresolved dependency, file-size, path-budget and HTTP 403 gaps;
therefore HOLD. See
`results/repository-inspection-2026-10-14T11-32-44-924Z.json`.
GitHub live access was exercised; Bitbucket protocol behaviour is tested with
stubbed responses, not a live Bitbucket repository. These are development checks,
not evidence of calibrated malware-detection accuracy.

Inspection reports also retain `review_errors`: the review round, failure category
and rejected findings. Source text is accompanied by numbered lines for citation
accuracy. Schema/citation failures can be corrected within the same four-call
budget; rejected findings never enter policy evidence. Schema-valid file requests
can advance inspection during correction. API failures or an exhausted correction
budget keep the assessment unresolved unless valid harmful evidence was already
established. The reviewer prioritises automatic workspace tasks and the Git hooks
they activate; this is generic traversal guidance, not a repository-name rule.

Citations are anchored to a unique exact source substring (outer quote whitespace
is ignored). The inspector derives authoritative line numbers and stores complete
source lines, recording changes in `citation_adjustments`. It does not fuzzy-match
code or accept an invented or ambiguous quote. A wrong model line number alone no
longer discards an otherwise verifiable finding.

### Conversation-triggered inspection

```sh
npm run start:v2 -- --conversation conversation.json --dry-run
npm run start:v2 -- --conversation conversation.json
```

Input format (illustrative messages, not collected evidence):

```json
{
  "messages": [
    {"time":"t0","sender":"candidate","message":"Please share the assessment."},
    {"time":"t1","sender":"recruiter","message":"Run npm install and npm run dev in https://github.com/OWNER/REPO"}
  ]
}
```

Messages are processed in file order, exposing only each arrived prefix to the
extractor. Reviewer metadata and ground truth are removed. Candidate statements,
links alone, and ambiguous requests cannot trigger a repository fetch. An explicit
execution request must contain exactly one supported repository root URL in that
same message. Earlier-message URL binding, multiple repositories and document-link
resolution are not implemented; those targets remain HOLD for clarification.

HOLD is emitted and saved before inspection begins. The source inspection and
policy result are then saved in the same timestamped conversation report. There
is at most one inspection per conversation run. Later instructions do not reuse
an earlier clearance for changed code or actions; a new assessment is required.
Candidate replies and benign recruiter acknowledgements retain scoped guidance.
Early SAFE is conversation-only. A completed scoped-clean inspection can permit
proceeding with precautions without independent sender verification. By default no prior or likelihood is
configured in this path. Optional `--belief-config MODEL.json` enables validated,
provenance-labelled Bayes updates and assumed-cost decisions, while preserving safety
constraints. See the [V2 probability documentation](README.md#belief-updates-and-cost-based-decisions).
The provided synthetic exercise configuration is not a measured deployment model.
This command is a sequential CLI; the separate demo provides in-memory chat sessions.
Tests use stubbed extraction and inspection. A live synthetic conversation run on
2026-10-14 correctly triggered at the execution request, then retained HOLD when
GitHub returned HTTP 403. The subsequent authenticated live run completed the path: SAFE (conversation only)
→ HOLD (inspection pending) → FLAG (cited external-script execution). See
`results/conversation-v2-2026-10-14T13-31-42-556Z.review.md`. This verifies one known
development case, not held-out detection performance.

Source errors now distinguish HTTP 429 and HTTP 403 with an exhausted allowance
as `provider_rate_limited`. `source_errors` records the affected path and
`retry_at` when the provider supplies a valid reset or retry header. Further
network fetches in that source instance are suppressed after the limit response.
Other HTTP 403 responses remain generic access failures. No automatic waiting or
cross-run retry is performed; unresolved inspection stays HOLD.

### Optional GitHub authentication

Set `V2_GITHUB_TOKEN` in your local `.env` (or the deployment secret environment)
to use authenticated GitHub API requests. Use a GitHub token with only the read
access required for public source inspection. Never put the token in a conversation
file or repository URL. The CLI already loads `.env`; this change does not edit it.

The token is sent only to `api.github.com`, with redirects disabled. It is never
passed to Bitbucket, the model, or inspection reports. Authenticated fetching
still rejects private repositories: credentials do not implicitly authorise
sending private source to an LLM. Without this variable, public access remains
anonymous. Rate limits and source-inspection budgets still apply. See
[GitHub authentication](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api)
and [rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).


## V2 coding standards and checks

Project conventions are recorded in [AGENTS.md](../../AGENTS.md). All V2 source, scripts, and
unit tests use Prettier, ESLint, and strict TypeScript. Linting rejects explicit `any`,
unused variables, parameter mutation, direct property assignment, and common mutable
collection operations. Intentional process exit status, bounded streaming buffers,
and the test that proves snapshot isolation have narrow documented exceptions.

```sh
npm run format:v2       # Format V2 source and tests
npm run check:v2        # Formatting, lint, typecheck, and all V2 tests
npm test               # V2 tests only
```

Use Node 24 and the existing pnpm lockfile (`pnpm install --frozen-lockfile`). Checks
make no live API calls and require no API keys. Fixture-based tests require the local
`data/synthesis/synthetic-repository-pair.json` and `synthetic-benchmark-100.json` files.
The required synthetic fixtures, partition, challenge snapshots and evaluation
reference report are tracked explicitly. The broad `data*` ignore rule still
protects other local datasets; it does not prevent Git from tracking these files.

The V2 entry point remains `src/v2/agent-v2.ts`. Inspection separates source collection,
exact citation validation, review attempts, and report construction. Provider access
separates bounded transport from GitHub and Bitbucket readers. Reports use immutable
snapshots and shared persistence helpers. Existing CLI flags and report fields remain
compatible; this refactor does not change the prompts or assumed decision costs.

### Prepare a manual repository review

```sh
npm run start:v2 -- --prepare-review results/conversation-v2-2026-10-14T13-36-33-060Z.json
```

This offline command accepts a standalone live-inspection report or a completed conversation
report containing exactly one inspection. It creates a new `results/manual-review-*.json`
without changing the original report. The handoff includes the source report hash, repository
revision, requested action, automated findings, and unresolved gaps. Fill in evidence and
notes for each item, then record your identity, actual review time, remaining gaps, and
conclusion. Never run the inspected code as part of this source-only review.

A prepared record is not a completed review. The command makes no network or LLM calls.

### Apply a completed manual review

Use a freshly prepared template. For each gap set `status` to `resolved` or `unresolved`;
for each finding use `supported`, `disputed`, or `unresolved`. Preserve original items and
order. Evidence entries are objects with `file`, `start_line`, `end_line`, `quote`, and
`reason`. Resolved gaps and supported/disputed findings require at least one citation.

Complete `human_review`: reviewer, ISO timestamp, actual elapsed minutes, revision confirmation,
inspected file paths, findings (citation fields plus `harmful`), remaining gaps, and conclusion.
Use `unresolved`, `no_harmful_behaviour_found`, or `harmful_behaviour_found` as the outcome.
Set the top-level status to `completed_human_review` only after finishing the review.

```sh
npm run start:v2 -- --apply-review results/manual-review-YOUR-REVIEW.json --source results/ORIGINAL-REPORT.json
```

The explicit original report must match the recorded hash, artifact, revision, and scope.
Every original gap and finding must be addressed. A clean outcome requires no remaining
gaps; a harmful outcome requires cited harmful findings. An unavailable original revision
cannot be resolved through this command: obtain a new pinned inspection first.

The command writes a separate `manual-review-assessment-*.json`. Harm results in FLAG;
unresolved source stays HOLD, while a completed scoped-clean review permits precautions
under the current on-the-go policy. Sender verification remains separate optional context.
Previously observed harm remains FLAG even if disputed; clearing that flag requires a separate
adjudication workflow, which is not implemented. Original reports and review records remain
unchanged. No probability update or dataset relabelling occurs, and the new assessment does
not resume a running conversation process.

Citations are structurally validated human attestations. This offline command does not fetch
source to independently verify quotes, authenticate reviewers, or establish recruiter identity.

### Repository assessment boundary (2026-10-15)

New inspections set `scope.inspection_boundary` to `repository_controlled_code`. V2 examines
repository-defined installation/startup scripts, local imports, workspace tasks, hooks,
configuration, and credential/network handling. Missing relevant local source still leaves
the assessment unresolved, and concrete harmful repository behaviour still produces FLAG.

Third-party package implementations and their installation scripts are unverified and outside
scope. Their presence alone no longer creates an automatic gap. The reviewer should not request
lockfiles solely to audit those packages, or optional environment examples used only as setup
documentation. Visible suspicious dependency sources, overrides, and repository-controlled
payload-loading commands remain in scope. The inspector's existing file-size and secret-file
restrictions remain enforced; no missing-file errors are silently discarded.

A scoped clean result means no harmful behaviour was found in the inspected repository code;
it does not certify the complete installation/runtime or establish recruiter authorisation.
Earlier reports and manual-review records retain their original scope and gaps. Run a fresh
inspection before preparing a review under the narrower boundary; do not relabel old gaps as
resolved merely because the scope changed. This supersedes earlier descriptions requiring
inspection of all third-party dependency code.

### Supplemental inspection requests

Live model requests now include a purpose, reason, and source reference. The inspector
records accepted, outside-scope, and unsupported requests in `file_request_decisions`.
Execution hooks and server/configuration files take priority within the existing budgets.
Listed root configuration files and Next.js App Router entry files can be read without an
explicit import when the supplied package scripts establish the framework. Other local files
require a reference in supplied source. This is a bounded reference heuristic, not a full
module resolver; unsupported in-scope requests keep the assessment unresolved.

Unreferenced lockfiles requested for dependency verification and documentation-only env
examples are outside scope. Referenced local code and existing source-access restrictions
remain enforced. Already supplied files are not fetched again.

The portfolio run `results/repository-inspection-2026-10-15T09-06-52-113Z.json` inspected
eight files across four model calls, including `lib/github.ts`, with no accepted harmful
findings. It remained HOLD because additional local components/configuration were requested
at the final round. The narrower scope does not guarantee completion within the budget.

### Batched local imports

Before each model review, the inspector follows listed literal relative imports and aliases
explicitly declared in a JSON `tsconfig.json`. Listed root framework configuration files are
collected at the start. This reduces model calls spent requesting one import layer at a time.
Reads still use the same source restrictions and file/byte budgets; exhaustion remains a gap.
This helper is not a full JavaScript resolver: dynamic targets, JSONC/extended configurations,
and unlisted paths still need model review. Collected files are recorded in the usual file
hashes and inspected-files list. Automatic collection does not establish safe execution.

The reviewer also receives the remaining path and byte allowances in `collection_budget`.
After reviewing the collected files, a request for more files ends the inspection immediately
when either allowance is exhausted. The report retains a collection-budget gap and incomplete
coverage; cited harmful findings still take precedence. This avoids further model calls that
cannot obtain new source files. Citation correction and scope feedback retain their existing
review-round limits.

### Source-backed scope gaps

Live reviews now return structured gap claims: a description, category, source file, and
exact source quote. Claims explicitly categorized as third-party verification or optional
setup are rejected for correction, as are repository gaps without matching supplied source.
Rejected descriptions are retained in `review_errors` and sent back in `correction.rejected_gaps`.
Persistent invalid claims leave the result unresolved within the existing four-call limit.
Independently validated harmful findings remain retained during gap correction.

Public reports still use string `scope.gaps`; legacy injected offline reviewers retain their
string-gap input contract. Category and relevance judgments still depend on the model: an
exact quote establishes provenance, not the truth of its interpretation. Machine collection
and source-access gaps cannot be cleared by the model.

The live run `results/repository-inspection-2026-10-16T07-04-43-826Z.json` inspected twenty
portfolio files in two model calls. It remained HOLD with one machine gap for the file-count
budget, without model-generated dependency or optional-env blockers. This result is limited
to the supplied revision and inspected code.

When collection ends, the report names known unread local imports and accepted file requests
as `Uninspected local path: ...` gaps. These become individual pending items in the manual
review checklist generated by `--prepare-review`. This list covers discovered paths only;
unread files may reveal further dependencies. Generic budget gaps remain alongside the
paths, and creating a checklist does not complete review or change the agent decision.

### Apply a recorded automated supplement

```sh
npm run start:v2 -- --apply-supplement SUPPLEMENT.json --source ORIGINAL_REPORT.json
```

The supplement uses `purpose: automated_repository_supplement`, `schema_version: 1`,
`coverage: listed_files_only`, the original report SHA-256, a scoped `inspection`, file hashes,
and per-file observations. Original and supplemental artifact, pinned revision, action and
repository-controlled-code boundary must match. File inventories must be unique and complete;
overlapping file hashes must agree. This validates recorded attestations, not source contents
or the correctness of the automated interpretation.

A resolved subset can clear corresponding `Uninspected local path` and duplicate unjustified
request gaps. Broader coverage/budget gaps and new unresolved gaps remain. Findings from both
records are retained; previously observed harm keeps FLAG. Authorisation remains unresolved,
and no Bayes update is inferred for dependent follow-up evidence.

The command creates a separate combined assessment. Pass it to `--prepare-review` to obtain
a fresh pending checklist; previous reports and human-review files remain unchanged. The
portfolio example is `results/automated-supplement-portfolio-2026-10-16.json`; its combined
assessment (09-29-07 report) covers thirty files with one broader coverage gap remaining.

### Reopening a saved GitHub revision

The source reader accepts an optional fourth `requestedRevision` argument containing a full
40- or 64-character lowercase commit hash. It fetches that commit rather than HEAD and rejects
a returned SHA mismatch before reading the tree. Existing callers continue to resolve HEAD.
Explicit historical selection currently supports GitHub only; Bitbucket keeps its existing
branch-pinning flow. Source access, credential isolation and network/file budgets still apply.
The commit endpoint is documented in [GitHub's REST reference](https://docs.github.com/en/rest/commits/commits#get-a-commit).

The portfolio execution-path audit (`results/portfolio-execution-path-audit-2026-10-21.json`)
resolves the final source-coverage gap for the old saved revision using twenty hash-verified
re-reads plus the earlier supplemental review. Its policy recommendation remains HOLD due
to unresolved assessment authorisation. Current HEAD changed and requires its own inspection.
The audit is a separate automated assessment, not a completed human checklist or automatic
conversation resume.

### Record assessment authorisation

```sh
npm run start:v2 -- --prepare-authorisation INSPECTION_REPORT.json
npm run start:v2 -- --apply-authorisation RECORD.json --source INSPECTION_REPORT.json
```

Preparation creates a pending record with blank reviewer/evidence fields and false confirmation
flags. Use an independently obtained company contact or company-controlled confirmation to
verify requester identity, authority to arrange the assessment, and the exact repository,
revision and requested action. A LinkedIn profile or the requester claim alone is insufficient.
Record a retained evidence reference and summary without copying credentials or private data.

After checking, complete `verification`, choose `independent_company_contact` or
`company_controlled_confirmation`, and set status to `completed_verification`. Set outcome
to `verified` only if identity, authority and action confirmation are all true. An unresolved
record remains unverified but does not itself block a scoped-clean live assessment.
Applying a verified record cannot clear
unresolved source inspection or override harmful findings.

Source report hash and exact scope must match. Verification dates cannot be in the future.
The application emits a separate assessment using the existing policy; it does not run code,
refresh source, authenticate evidence/reviewer identity, change labels or apply a Bayes update.
Changed revisions require new checks. The authorisation command currently accepts standalone
live inspection, combined automated supplement assessment, or automated execution-path audit
reports. It does not resume an active conversation.

A blank portfolio record is saved at
`results/assessment-authorisation-2026-10-21T10-42-10-915Z.json`. It relates to the saved old
commit only, contains no claimed hiring verification, and remains pending.

### Use authorisation during a conversation run

```sh
npm run start:v2 -- --conversation CHAT.json --authorisation RECORD.json --source INSPECTION_REPORT.json --dry-run
npm run start:v2 -- --conversation CHAT.json --authorisation RECORD.json --source INSPECTION_REPORT.json
```

The optional record is validated before any extraction/source calls and is not sent to the
model. Dry run validates the supplied record without making API calls. A live run still
emits HOLD first and performs at most one fresh inspection. It applies authorisation only
when the current execution request, repository, fresh revision, and inspection boundary
match the approved scope. Conversation inspection uses the complete execution-request
message as `requested_action`; a record approving different text does not automatically
match. Approval for an old saved commit does not carry to changed HEAD.

Completed scoped-clean inspection returns SAFE with precautions for that request
under the on-the-go policy, with or without independent authorisation. Supplied
authorisation records are optional context and cannot replace current source/scope
checks. Unresolved inspection stays HOLD; harm in the matching saved assessment or
current inspection remains FLAG. Candidate replies and benign acknowledgements
retain guidance, while new or unclear execution instructions require reassessment.
Delayed recognition of an earlier request cannot clear a newer unassessed instruction.
No follow-up Bayes update is invented. This reruns the conversation; it does not
mutate or resume an old report.

Authorisation preparation/application can also use a completed conversation report containing
exactly one inspection. Its full source-report hash is bound to the record. Multiple
inspections require selection of a standalone report and are rejected as ambiguous.

### Wallet-approval boundary policy

`src/v2/wallet-approval-policy.ts` records source-backed wallet permission annotations and
caller-supplied inspection results. A request must cite the current counterparty message
and an already visible artifact. Results must match the artifact and request identifier.
These checks validate provenance/binding, not whether the annotation or inspection is true.
The module makes no network calls and never connects a wallet or submits transactions.

Repository clearance cannot release a new wallet permission: the gate returns HOLD. Reported
harm remains FLAG even after later clean results or another request. A scoped clean wallet
result alone still cannot authorise spending; action-specific authorisation is not implemented
in this gate. Live conversation extraction now uses it; contract inspection remains unimplemented.

The targeted scripted regression for case 257 is saved in
`results/wallet-boundary-regression-2026-10-21T11-30-04-627Z.json`. All five checkpoints pass
across seven events. An explicit fixture request annotation and authored inspection outcome
are used; this is a policy check, not evidence of automated wallet-scam detection accuracy.
The existing repository replay coverage remains 28/100 cases.

### Live wallet-request annotation

`--conversation` now annotates wallet-permission requests on counterparty message prefixes,
including messages after repository inspection. Candidate messages make no wallet annotation
call. Before known harmful behaviour stops further checks, the maximum additional call count
is one per counterparty message (at most 100 messages per run). Dry-run displays upper call
bounds and makes no API calls. The existing model setting is reused.

The wallet annotator uses the SDK's Zod `outputType` pattern described in the
[official agent documentation](https://developers.openai.com/api/docs/guides/agents/define-agents).
Its status/reference/quote/reason output is independently checked against arrived counterparty
text. It cannot return probabilities or actions. Model inputs contain only projected message
fields; repository findings, ground truth, authorisation evidence and scoring data are excluded.

Explicit or ambiguous wallet requests return wallet-specific HOLD. A source-backed current
request binds to its single supplied URL or, with no URL, the prior assessment artifact. Missing
or multiple targets remain unresolved; no link is fetched. Known wallet requests remain HOLD
through later messages. Extraction failure holds the current message without granting wallet
permissions. A later candidate-only step can only permit conversation, never wallet actions.
Existing FLAG remains sticky. No live wallet/contract check or spending release is implemented.

Conversation reports retain wallet annotations (including absence) and a wallet prompt hash.
Live functional probes: `results/wallet-request-model-smoke-2026-10-21T20-41-44-567Z.json`
matched six proposed targets. A real CLI run produced wallet HOLD without source inspection:
`results/conversation-v2-2026-10-21T20-46-03-254Z.json`. These are authored smoke probes,
not held-out accuracy or expanded 100-case benchmark coverage.
