# Project coding standards

Apply the user-provided coding-standards principles to future project work. V2 lives in
`src/v2`; V1 remains in `src/v1`. Preserve public commands, report schemas, model prompts,
cost assumptions, and safety boundaries unless the task explicitly changes them.

- Use descriptive names and verb-noun helpers. Keep functions focused; split orchestration
  from parsing, I/O, and calculations when it improves readability.
- Prefer immutable objects and collections, `readonly` inputs, spread, and map/filter.
  Do not mutate caller-owned values. A necessary system-side effect or bounded streaming
  buffer may have a narrowly scoped lint exception explaining why.
- Use strict TypeScript and `unknown` with validation at external boundaries; no `any`.
- Prefer early returns, named limits, existing utilities, and the standard library.
  Avoid speculative layers and unnecessary abstractions.
- Handle errors at the responsible boundary. Preserve actionable errors without exposing
  credentials. Never print `.env` or tokens.
- Explain why in comments; document public functions with concise JSDoc, including material
  limits. Keep tests arranged as setup, action, and assertions with descriptive names.
- Parallelize independent work only. Evidence updates, rate-limited fetches, report writes,
  and ordered inspection rounds intentionally remain sequential.
- Do not execute inspected repositories, install their packages, or fetch their payloads.
  Keep source/path/size/time restrictions and exact citation validation intact.
- Keep ground truth and scoring metadata out of agent inputs. Preserve hypothetical versus
  measured provenance; never invent likelihoods or labels while refactoring.

Before completing V2 changes run `npm run check:v2` (format, lint, strict typecheck, tests).
Use `npm run format:v2` to format source and tests. Local tests must not require credentials
or live APIs. Do not overwrite historical results or user datasets for a style change.
