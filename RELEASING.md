# Releasing FlexTab (Chrome Web Store)

Runbook for cutting an extension release and uploading the ZIP to the CWS.

## Channels: FlexTab Beta and FlexTab

One codebase builds two permanent, separate extension items (TASK-111, design in
backlog doc-2). Every build names its channel; a build without one fails.

| | `--channel=stable` | `--channel=beta` |
|---|---|---|
| Name | package.json `displayName` | FlexTab Beta |
| Icon | `assets/icon.png` | `assets/icon.beta.png` |
| Manifest version | package.json `version` | `X.Y.Z.N` from the tag `beta-vX.Y.Z.N` |
| Version people see | the version | `version_name` "X.Y.Z Beta N" |
| Firefox add-on id | `flextab@flextabmanager.com` | `flextab-beta@flextabmanager.com` |
| Output | `build/<target>-prod[.zip]` | `build/<target>-beta[.zip]` |

```bash
npm run build:zip -- --channel=stable
npm run build:zip -- --channel=beta --beta-tag=beta-v0.1.0.7
# the beta tag can also come from FLEXTAB_BETA_TAG, or a beta-v* tag on HEAD
# --target=firefox-mv3 builds Firefox; the default is chrome-mv3
```

How it works: `scripts/build.mjs` runs Plasmo with `--tag=prod` or `--tag=beta`
(the tag picks `assets/icon.<tag>.png` and the build folder) and sets the
`FLEXTAB_*` variables that the placeholders in package.json `manifest` read. An
unset variable drops its placeholder, so stable keeps package.json's name and
version, and the Chrome manifest stays exactly as before. Plasmo's manifest check
allows a three-part version only, so a beta builds as `X.Y.Z` and the script then
writes `X.Y.Z.N` into `manifest.json` before zipping. The channel logic lives in
`scripts/channel.mjs`, tested by `scripts/channel.test.mjs`.

The two items have different extension ids, so both install in one browser
profile. The Firefox ids are permanent once uploaded to AMO.

### Cutting a beta

```bash
npm run release:beta          # checks, builds build/chrome-mv3-beta.zip, tags
git push origin beta-vX.Y.Z.N # when ready; the script never pushes
```

`scripts/release-beta.mjs` checks that HEAD is on `dev`, the working tree is
clean, a stable tag `vX.Y.Z` is in the history, there are commits since it, and
the new version is above every earlier beta tag. `X.Y.Z` is that stable tag and
`N` the number of commits since it. It then runs check-env and the beta build,
and only after the build succeeds creates the annotated tag `beta-vX.Y.Z.N`. Any
failure aborts with no tag left behind. A repository with no stable tag yet
cannot cut a beta: tag the last stable release first.

## Versioning

- **Single source of truth: `package.json` `version`.** Plasmo propagates it into
  the generated `manifest.json`. **Never edit the manifest version by hand.**
- **CWS rule:** the manifest version must be **dot-separated integers** (`1.2.3`,
  each segment 0–65535) and **strictly higher** than the currently published one.
  - ⚠️ **No semver pre-release suffixes** (`0.1.0-beta.1` is rejected). Stay numeric.
- **Scheme:** stay on `0.x.y` through beta (0.x already signals pre-1.0).
  - `release:patch` → bug fixes (`0.1.0 → 0.1.1`)
  - `release:minor` → features (`0.1.x → 0.2.0`)
  - bump to `1.0.0` at public launch.
- **Git tags are the record of what's live on CWS** — each release is tagged
  `vX.Y.Z` automatically by `npm version`.

## Release steps

```bash
# 0. Pre-flight
#    - nvm install && nvm use, then npm ci (pinned Node/npm)
#    - working tree clean (npm version requires it — commit other work first)
#    - on the intended branch
#    - prod env present: .env.production has PLASMO_PUBLIC_API_URL +
#      PLASMO_PUBLIC_API_HOST pointing at the REAL backend (not localhost).
#      build:zip runs scripts/check-env.mjs and fails otherwise.
npm run typecheck
npm run test:coverage -- --run  # tests and coverage gates must pass
npm run release:patch    # bump + commit "release: vX.Y.Z" + tag + build the
                         # stable zip (use release:minor for feature releases)

# Output: build/chrome-mv3-prod.zip  ← upload this to the CWS dashboard

git push && git push --tags   # record the published version
```

Then in the **CWS dashboard**: upload `build/chrome-mv3-prod.zip`, submit for
review. Each upload is reviewed (hours–days) even for beta. For the invite-only
beta keep visibility **Private/Unlisted** + the Google Group of trusted testers.

If CWS rejects the version as not-higher, just run `release:patch` again.

### Storage fixture (every release)

Each release adds what it leaves in browser storage as a test fixture, so every
later version is tested to load it (TASK-113). From the release's own build:

```bash
node scripts/capture-storage-fixture.mjs --build=build/chrome-mv3-prod --version=X.Y.Z
# writes src/test/fixtures/storage/vX.Y.Z.json; commit it with the release
```

`src/test/storageFixtures.test.ts` loads every fixture through the app's real
hydration (workspace, UI selection, settings, sign-in). Never edit or delete an
old fixture: a failing one means the new version breaks data users already have,
so add a migration instead.

## GitHub manual submission

Configure these repository **Actions variables** (public build configuration):

- `PLASMO_PUBLIC_API_URL`: the deployed backend base URL.
- `PLASMO_PUBLIC_API_HOST`: the scoped Chrome host match pattern ending in `/*`.

Keep publisher credentials in the existing `SUBMIT_KEYS` **Actions secret**.
Do not put these credentials in either public variable. Missing API variables
fail validation; submission has no localhost or CI-fixture fallback.

Run **Submit to Web Store** manually on the intended release commit. Its shared
verification job (with `browser: true`) selects Node from `.nvmrc`, installs
with `npm ci`, installs Chromium, typechecks, runs all regression tests
including the browser-mode suite with coverage gates, and builds the production
ZIP with the supplied API values.
Only after success does the publish job download that exact artifact and submit
it. It does not rebuild the extension. Submission runs are serialized and all
external Actions are pinned to commit SHAs.

Push (main, dev) and PR CI uses the same verification job with
`api.example.invalid` and without the browser suite, plus the Conventional
Commit and pinned-action checks; those ZIPs are build fixtures and must not be
uploaded to a store. Where each suite runs is in
[quality gates](docs/quality-gates.md#where-each-suite-runs). The
[quality gate contract](docs/quality-gates.md) records the covered scope, baseline
and remaining gaps; native extension E2E is not yet a release guarantee.

## Prerequisites & related docs

- **Prod env / config** (FE `.env.production`, BE `config.Validate`, CORS,
  OAuth redirect): see the beta-prep notes — backend host is env-driven, the
  build guard blocks localhost. `.env.example` is the tracked template.
- **Manual CWS/OAuth steps** (privacy form, screenshots, Google OAuth test
  users, deploy BE): tracked in the beta-release-prep memory.
- **Open decisions / coverage gates / feature notes:** `DECISIONS.md`.

## What ships in a build

`npm run build:zip -- --channel=stable` bundles the prod extension (newtab override, popup,
background worker) into `build/chrome-mv3-prod.zip`. The backend is deployed
separately (Go + Postgres + Redis) — the extension only talks to it over the
env-configured API host.
