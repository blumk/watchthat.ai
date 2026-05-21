# Prompt evals (promptfoo)

Regression suite for `lib/describe-change`. Each test case feeds inputs
into the real production function (via `providers/describe-change.js`)
and asserts on the parsed result — so it tests prompt construction +
Claude's response + our JSON parser as a single unit.

## Run locally

```bash
# Make sure your ANTHROPIC_API_KEY is in .env.local (same one the dev
# server uses).
pnpm eval
```

Each case fires one Claude (Haiku 4.5) call. Current suite is ~7 cases
which costs roughly $0.02 per full run.

To see results in the browser:

```bash
pnpm eval:view
```

## Adding a case

The curation rule: every test should correspond to a class of failure
we've actually seen. Don't add synthetic edge cases without a real bug
behind them.

Workflow:
1. Reproduce the bad output in dev (e.g. by replaying via the share-page
   or a manual scrape).
2. Add a `tests:` entry in `promptfooconfig.yaml` with the inputs that
   produced it and the assertion that would have caught it.
3. Run `pnpm eval` — the case should FAIL on `main`.
4. Fix the prompt or code, re-run, confirm the case now passes.
5. Open a PR. CI's prompt-evals workflow will re-run on any PR that
   touches `lib/describe-change.ts`, `lib/parse-json-response.ts`, or
   `evals/**`.

## Assertion types we use

- `not-icontains` — case-insensitive substring not present
- `javascript` — arbitrary JS expression, `output` is the
  `DescribeChangeResult` from describeChange
- `llm-rubric` — model-graded check (e.g. "does this answer mention…")
  Use sparingly; doubles Anthropic cost per case.

See [promptfoo assertion docs](https://www.promptfoo.dev/docs/configuration/expected-outputs/)
for the full list.

## CI integration

`.github/workflows/prompt-evals.yml` runs on PRs that change prompt
files (path-filtered to keep Anthropic spend bounded). It uses
`ANTHROPIC_API_KEY` from GitHub Actions secrets. A failed assertion
fails the workflow → blocks merge.
