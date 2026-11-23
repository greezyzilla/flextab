# Extension quality gates

QA-01 contract, reviewed 2026-10-19. Run with pinned Node 24.14.0/npm 11.9.0:

```sh
npm ci
npx playwright install chromium   # once per machine: browser-mode tests
npm run setup-hooks               # once per clone: Conventional Commit check on commit
npm run typecheck
npm run test:coverage -- --run    # both projects; npm run test:browser runs the browser one alone
# Supply the public API configuration described in RELEASING.md.
npm run build:zip -- --channel=stable
```

## Where each suite runs

CI stays light so a push answers in about two minutes (TASK-116): the browser
install and browser-mode tests run locally and before anything is published.

| Check | Push to main/dev, PR (`ci.yml`) | Release (`submit.yml`, later the release workflows) | Locally |
| --- | --- | --- | --- |
| Typecheck | yes | yes | `npm run typecheck` |
| jsdom unit tests + coverage gates | yes (`--project unit`) | yes | `npm run test:coverage -- --run` |
| Browser-mode tests (Chromium) | no | yes (`browser: true`) | `npm run test:browser` |
| Stable and beta builds | yes | yes | `npm run build -- --channel=...` |
| Firefox build + `web-ext lint` | yes | yes | `npm run lint:firefox` |
| Firefox smoke test (installed Firefox) | no | before a release, by hand | `npm run test:firefox` |
| Actions pinned to commit SHAs | yes (`check-actions-pinned.mjs`) | n/a | same script |
| Conventional Commits | yes, each commit in the push or PR (`check-commits.mjs`) | n/a | `commit-msg` hook after `npm run setup-hooks` |

The coverage numbers are the same with or without the browser project: it
measures none of the covered files. The commit check lists the six commits made
before it in `EXEMPT`, because history is never rewritten.

Dependencies update through Dependabot (`.github/dependabot.yml`): monthly, one
grouped PR per ecosystem (npm, GitHub Actions) to `dev`, and only for versions
published at least 7 days earlier. External actions stay pinned to SHAs;
Dependabot updates the SHA and its version comment.

The reusable verification workflow (`verify.yml`) runs these gates before
producing a release ZIP. PR/push CI and manual submission share it. A type
error, failed test or coverage regression blocks the build/publish dependency. Coverage reports are
uploaded even when the coverage step fails, if a report was produced. This
does not establish GitHub branch protection; repository settings are separate.

## Test projects

`vitest.config.ts` runs two projects in the same gate. `unit` is the jsdom
suite (everything except `*.browser.test.*`). `browser` runs
`src/**/*.browser.test.{ts,tsx}` in headless Chromium through Vitest browser
mode (`@vitest/browser` + Playwright), for checks jsdom cannot make. The first
is the colour-contrast guard (`src/components/contrast.browser.test.tsx`,
TASK-68): every Badge variant and every duplicate-mark tone stays at or above
4.5:1 against what it sits on, in light and dark, at every accent hue (step 10)
x colour intensity (step 25) x group tint, on the page, a panel, and tab rows at
rest and hovered on plain, Unsorted and every group colour's card. It needs a
real engine because the tokens use oklch relative colours, color-mix and
translucent fills. Chromium is installed only when `verify.yml` runs with
`browser: true` (release workflows), never on push or PR CI.

## Typecheck scope

TypeScript 5.9.3 is pinned in package.json/package-lock.json. It can parse the
string-named export in the installed Vite React plugin declaration that 5.3.3
could not parse. Source, tests and root TypeScript configuration are checked.
Plasmo asset declarations come from the installed base config; generated
`.plasmo`, build outputs and local build environment files are not required.
The existing Plasmo strictness/skipLibCheck settings are unchanged. This gate
is not a claim that the project enables TypeScript strict mode.

## Coverage contract and why it changed

The old global 99% statements/lines/functions and 90% branches were not met:
609 tests passed, but coverage was 88.88% statements/lines, 91.32% functions and
89.42% branches. CI did not run that gate. The comment claiming a 99.6% line
baseline was stale.

This repair adds 11 behavior tests using the production settings store and sync
service: guest isolation, first-account seeding, remote field adoption, local
and remote independent edits, debounce, GET/PUT failure retries, sign-out before
a queued push, and stopping timers/subscriptions. Account settings sync
had 100% statements/lines/functions and 97.82% branches at the QA-01 baseline.
The subsequent [DAT-17 session repair](settings-sync.md) adds deferred-response
and account-switch cases, plus new-tab lifecycle and login-profile tests.

Clean-install baseline: 620 tests in 48 files; 90.53% statements/lines, 93.35%
functions, 89.64% branches. The denominator remains the same logic layers:
services, stores, lib and utils. No production file was excluded to improve it.

The global gate now caps **uncovered counts**, using Vitest's negative threshold
values. This is an explicit replacement of the unmet percentage contract:

| Metric | Covered / total | Maximum uncovered |
| --- | ---: | ---: |
| Statements | 3136 / 3464 | 328 |
| Lines | 3136 / 3464 | 328 |
| Functions | 323 / 346 | 23 |
| Branches | 1428 / 1593 | 165 |

Adding unrelated covered code cannot dilute these gaps. Additional gates stop
high-risk files from regressing while another file's coverage improves:

| Files | Statements / lines / functions / branches minimum |
| --- | --- |
| importWorkspace, landedSnapshot, syncPolicy, workspaceBackup | 100 / 100 / 100 / 100% |
| mergeBase, revision, saveTabsAsGroup, settingsSync, spacesMerge3, structuredSync, syncStorage, useAuthStore (each individually) | 100 / 100 / 100 / 90% |
| yjsDoc | 98 / 98 / 100 / 84% |
| syncEngine | 85 / 85 / 95 / 83% |
| oauthLogin | 96 / 96 / 100 / 93% |

These are regression floors, not proof of correctness. Major remaining measured
gaps include dragDrop (58.13% lines), settings migrations/store (72.89% lines),
API wrappers (61.29% functions), syncEngine error/lifecycle paths (85.38% lines),
and conflict-state recovery (81.57% lines). Review those paths when changing
them and add behavior/failure tests rather than tests that duplicate source.

Component, hook and extension entry files are outside the coverage denominator;
their existing tests still run. Native Chrome multi-context and PostgreSQL
concurrency verification remain QA-02. A unit coverage percentage does not
prove browser persistence, network behavior or production recovery.

## Updating a gate

- Keep the denominator explicit. Do not exclude a file or add coverage-ignore
  comments just to pass.
- When closing gaps, lower the maximum uncovered count to preserve the gain.
  Raise a file's floor when its new behavior tests justify it.
- If an intentional refactor/tool update changes instrumentation, compare the
  JSON/HTML reports, explain the changed counts and risks in the review, and
  rerun on a clean dependency install. Do not silently relax the gate.
- Verify failure as well as success when changing gate configuration: a type
  error must fail typecheck and added uncovered logic must fail coverage.

References: [TypeScript 5.6 arbitrary module identifiers](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-6.html#support-for-arbitrary-module-identifiers),
[Vitest 3 coverage thresholds](https://v3.vitest.dev/config/#coverage-thresholds).
