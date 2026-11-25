# Extension quality gates

Run with pinned Node 24.14.0/npm 11.9.0:

```sh
npm ci
npx playwright install chromium   # once per machine: browser-mode tests
npm run setup-hooks               # once per clone: Conventional Commit check on commit
npm run typecheck
npm run lint
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
| ESLint (correctness rules only, no formatting) | yes | yes | `npm run lint` |
| jsdom unit tests + coverage gates | yes (`--project unit`) | yes | `npm run test:coverage -- --run` |
| Browser-mode tests (Chromium) | no | yes (`browser: true`) | `npm run test:browser` |
| Stable build | yes | yes | `npm run build -- --channel=stable` |
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
| Statements | 229 |
| Lines | 112 |
| Functions | 52 |
| Branches | 246 |

Adding unrelated covered code cannot dilute these gaps. Additional gates stop
high-risk files from regressing while another file's coverage improves:

| Files | Statements / lines / functions / branches minimum |
| --- | --- |
| importWorkspace, landedSnapshot, syncPolicy, workspaceBackup | 100 / 100 / 100 / 100% |
| revision, saveTabsAsGroup (each individually) | 100 / 100 / 100 / 90% |
| mergeBase | 100 / 100 / 100 / 80% |
| settingsSync | 100 / 100 / 96.42 / 90% |
| spacesMerge3 | 99.53 / 100 / 97.61 / 90% |
| structuredSync | 97.29 / 100 / 100 / 90% |
| syncStorage | 97.11 / 100 / 94.11 / 80.95% |
| useAuthStore | 97.19 / 97.8 / 95.45 / 90% |
| yjsDoc | 94.7 / 98 / 98.92 / 82.78% |
| syncEngine | 85 / 85 / 89.15 / 81.62% |
| oauthLogin | 92.07 / 96 / 68.18 / 93% |

Measured with Vitest 5 (2026-11-25). Its V8 coverage remapping counts code that
Vitest 3 left out: never-run no-op callbacks (`.catch(() => {})`), implicit
`else` branches and defensive `if`s. The same code measured lower, so the caps
and the floors of the files that dropped were reset to the new measurement
(each floor is the lower of the old floor and the new number). Under Vitest 3
the caps were 328 / 328 / 23 / 165 and the floors 100 / 100 / 100 / 90% for the
eight sync files, 98 / 98 / 100 / 84% for yjsDoc, 85 / 85 / 95 / 83% for
syncEngine and 96 / 96 / 100 / 93% for oauthLogin; bringing the critical files
back to those floors with behaviour tests is its own task. The numbers were
checked stable across runs on a clean install (`measureSettingsPage` used to be
covered only when a component test outlived a 300 ms timer; it now has its own
test).

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
[Vitest coverage thresholds](https://vitest.dev/config/coverage#coverage-thresholds).
