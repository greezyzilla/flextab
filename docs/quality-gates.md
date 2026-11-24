# Extension quality gates

Run with pinned Node 24.14.0/npm 11.9.0:

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

CI stays light so a push answers in about two minutes: the browser
install and browser-mode tests run locally and before anything is published.

| Check | Push to main/dev, PR (`ci.yml`) | Release (`release.yml` → `verify.yml` with `browser: true`) | Locally |
| --- | --- | --- | --- |
| Typecheck | yes | yes | `npm run typecheck` |
| jsdom unit tests + coverage gates | yes (`--project unit`) | yes | `npm run test:coverage -- --run` |
| Browser-mode tests (Chromium) | no | yes (`browser: true`) | `npm run test:browser` |
| Stable and beta builds | yes | yes | `npm run build -- --channel=...` |
| Firefox build + `web-ext lint` | yes | yes | `npm run lint:firefox` |
| No new required permission (built manifests vs `permissions.lock.json`) | yes | yes | `npm run check:permissions` |
| `permissions.lock.json` changes only with the manifest | yes, each commit | n/a | `node scripts/check-permissions.mjs --lock-commits=<range>` |
| Firefox smoke test (installed Firefox) | no | before a release, by hand | `npm run test:firefox` |
| Actions pinned to commit SHAs | yes (`check-actions-pinned.mjs`) | n/a | same script |
| Conventional Commits | yes, each commit in the push or PR (`check-commits.mjs`) | n/a | `commit-msg` hook after `npm run setup-hooks` |

The coverage numbers are the same with or without the browser project: it
measures none of the covered files. The commits made before the commit check
existed are listed in `EXEMPT` (`scripts/check-commits.mjs`).

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
is the colour-contrast guard (`src/components/contrast.browser.test.tsx`):
every Badge variant and every duplicate-mark tone stays at or above
4.5:1 against what it sits on, in light and dark, at every accent hue (step 10)
x colour intensity (step 25) x group tint, on the page, a panel, and tab rows at
rest and hovered on plain, Unsorted and every group colour's card. It needs a
real engine because the tokens use oklch relative colours, color-mix and
translucent fills. Chromium is installed only when `verify.yml` runs with
`browser: true` (release workflows), never on push or PR CI.

## Typecheck scope

TypeScript 5.9.3 is pinned in package.json/package-lock.json; it parses the
string-named export in the installed Vite React plugin declaration. Source,
tests and root TypeScript configuration are checked. Plasmo asset declarations
come from the installed base config; generated `.plasmo`, build outputs and
local build environment files are not required. Plasmo's strictness and
skipLibCheck settings apply. This gate is not a claim that the project enables
TypeScript strict mode.

## Coverage contract

The denominator is the logic layers: services, stores, lib and utils. No
production file is excluded to improve the numbers.

The global gate caps **uncovered counts**, using Vitest's negative threshold
values:

| Metric | Maximum uncovered |
| --- | ---: |
| Statements | 328 |
| Lines | 328 |
| Functions | 23 |
| Branches | 165 |

Adding unrelated covered code cannot dilute these gaps. Additional gates stop
high-risk files from regressing while another file's coverage improves:

| Files | Statements / lines / functions / branches minimum |
| --- | --- |
| importWorkspace, landedSnapshot, syncPolicy, workspaceBackup | 100 / 100 / 100 / 100% |
| mergeBase, revision, saveTabsAsGroup, settingsSync, spacesMerge3, structuredSync, syncStorage, useAuthStore (each individually) | 100 / 100 / 100 / 90% |
| yjsDoc | 98 / 98 / 100 / 84% |
| syncEngine | 85 / 85 / 95 / 83% |
| oauthLogin | 96 / 96 / 100 / 93% |

These are regression floors, not proof of correctness. The weakest covered
areas are dragDrop, settings migrations/store, API wrappers, syncEngine
error/lifecycle paths and conflict-state recovery. Review those paths when
changing them and add behavior/failure tests rather than tests that duplicate
source.

Component, hook and extension entry files are outside the coverage denominator;
their tests still run. Native Chrome multi-context and PostgreSQL concurrency
are not verified by this suite. A unit coverage percentage does not prove
browser persistence, network behavior or production recovery.

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
