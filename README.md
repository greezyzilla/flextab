# FlexTab extension

A Plasmo browser extension for organizing tabs into spaces, projects, and groups.

## Local setup

Use the pinned Node runtime and its bundled npm. npm is the supported package
manager; `package-lock.json` is the dependency lockfile.

```bash
nvm install
nvm use
npm ci
cp .env.example .env.development
npm run dev
```

Load `build/chrome-mv3-dev` as an unpacked extension in Chrome. The development
API defaults to localhost; configure `.env.development` for your backend.

`.nvmrc`, `package.json` `devEngines`, and `packageManager` pin Node 24.14.0 / npm
11.9.0. npm validates `devEngines` before install, CI, and run commands. Update
these together when changing the toolchain, then re-run a clean install, tests,
and production ZIP build. Use `devEngines`, not `engines.node`: Parcel also reads
`engines` to infer the bundle target, while this extension must target browsers.
See [npm devEngines](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#devengines)
and [Parcel targets](https://parceljs.org/features/targets/).

## Verification and production build

```bash
npm test -- --run
# Set both variables to the deployed backend; values enter the public bundle.
export PLASMO_PUBLIC_API_URL=https://api.example.com
export PLASMO_PUBLIC_API_HOST='https://api.example.com/*'
npm run build:zip
```

Output: `build/chrome-mv3-prod.zip`. `.env.production` may supply these values for
local builds; CI injects them explicitly and does not require an untracked env
file. Never put secrets in `PLASMO_PUBLIC_*` variables.

PRs and pushes to `main` run the shared verification workflow: pinned runtime,
`npm ci`, all regression tests, production ZIP build, and artifact upload. CI
uses `api.example.invalid` so its artifact is only for build verification.

Typecheck and coverage thresholds remain open under audit QA-01; a passing CI
run currently guarantees the steps above, not those additional gates.

For release versions, repository configuration, and manual Web Store submission,
see [RELEASING.md](RELEASING.md).
