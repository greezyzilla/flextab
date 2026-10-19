# Releasing FlexTab (Chrome Web Store)

Runbook for cutting an extension release and uploading the ZIP to the CWS.

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
npm run release:patch    # bump + commit "release: vX.Y.Z" + tag + build the zip
                         # (use release:minor for feature releases)

# Output: build/chrome-mv3-prod.zip  ← upload this to the CWS dashboard

git push && git push --tags   # record the published version
```

Then in the **CWS dashboard**: upload `build/chrome-mv3-prod.zip`, submit for
review. Each upload is reviewed (hours–days) even for beta. For the invite-only
beta keep visibility **Private/Unlisted** + the Google Group of trusted testers.

If CWS rejects the version as not-higher, just run `release:patch` again.

## GitHub manual submission

Configure these repository **Actions variables** (public build configuration):

- `PLASMO_PUBLIC_API_URL`: the deployed backend base URL.
- `PLASMO_PUBLIC_API_HOST`: the scoped Chrome host match pattern ending in `/*`.

Keep publisher credentials in the existing `SUBMIT_KEYS` **Actions secret**.
Do not put these credentials in either public variable. Missing API variables
fail validation; submission has no localhost or CI-fixture fallback.

Run **Submit to Web Store** manually on the intended release commit. Its shared
verification job selects Node from `.nvmrc`, installs with `npm ci`, typechecks,
runs all regression tests with coverage gates, and builds the production ZIP
with the supplied API values.
Only after success does the publish job download that exact artifact and submit
it. It does not rebuild the extension. Submission runs are serialized and all
external Actions are pinned to commit SHAs.

PR/main CI uses the same verification job with `api.example.invalid`; those ZIPs
are build fixtures and must not be uploaded to a store. The
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

`plasmo build --zip` bundles the prod extension (newtab override, popup,
background worker) into `build/chrome-mv3-prod.zip`. The backend is deployed
separately (Go + Postgres + Redis) — the extension only talks to it over the
env-configured API host.
