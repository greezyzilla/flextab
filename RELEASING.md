# Releasing FlexTab (Chrome Web Store)

Runbook for cutting an extension release and uploading the ZIP to the CWS.

## The build

One public item, FlexTab. Every build names its channel (`--channel=stable`);
a build without one fails.

| | `--channel=stable` |
|---|---|
| Name | package.json `displayName` |
| Icon | `assets/icon.png` |
| Manifest version | package.json `version` |
| Firefox add-on id | `flextab@flextabmanager.com` |
| Output | `build/<target>-prod[.zip]` |

```bash
npm run build:zip -- --channel=stable
# --target=firefox-mv3 builds Firefox; the default is chrome-mv3
```

How it works: `scripts/build.mjs` runs Plasmo with `--tag=prod` and sets the
`FLEXTAB_*` variables that the placeholders in package.json `manifest` read.
The channel logic lives in `scripts/channel.mjs`, tested by
`scripts/channel.test.mjs`. The Firefox add-on id is permanent once uploaded to
AMO.

## Firefox build

The same code builds for Firefox with `--target=firefox-mv3`. Plasmo turns the background service worker into Firefox's event
page; package.json `manifest.overrides.firefox` drops the Chrome-only `favicon`
permission; `browser_specific_settings.gecko` (kept for Firefox only) sets the
add-on id, `strict_min_version` 140.0 (the ESR, and the first with
built-in data consent) and `data_collection_permissions` (none required; account
data, sign-in data, saved tabs and the device id optional, asked for at sign-in;
the list in `src/services/apiAccess.ts` must match it, a test checks).

```bash
npm run build:zip -- --channel=stable --target=firefox-mv3   # build/firefox-mv3-prod.zip
npm run lint:firefox      # Mozilla's web-ext lint on build/firefox-mv3-prod (0 errors required)
npm run test:firefox      # smoke test in the installed Firefox, see below
```

`web-ext` lives in `tools/web-ext` with its own lockfile, apart from the
extension's dependencies; every package in it was published at least 7 days
before it was added (`npm install --before=<date>`). `lint:firefox` installs it
with `npm ci --ignore-scripts`. Known lint warnings: `innerHTML` in React's
`dangerouslySetInnerHTML` and in `src/boot/shell.js` (the cached loading shell),
and the data consent key being newer than Firefox for Android 140.

`npm run test:firefox` drives the installed Firefox through WebDriver BiDi (no
dependency) and checks the new tab, popup, shortcuts, tab grouping, Sync off on
a revoked host permission, and an update while FlexTab pages are open. Run it
on a build pointed at `https://api.example.invalid`: it signs in with a fake
token, which a real server would answer by signing out.

## Permissions: never add a required one by accident

When an update asks for a new required permission, host or content script
match, Chrome disables FlexTab for every user until they accept it, and
Firefox holds the update back the same way. To the user FlexTab simply broke.
The rule:

- A new capability uses `optional_permissions` (or `optional_host_permissions`),
  requested in context from a user gesture, and released when turned off, as
  `tabGroups` does. Adding optional permissions always passes.
- `permissions.lock.json` records what each browser's build requires today
  (permissions, host permissions with the API host as `$API_HOST`, content
  script matches, and Firefox's required data collection).
  `npm run check:permissions` compares the **built** manifests with it; light CI
  runs it after the Chrome and Firefox builds. A required addition fails
  and is named.
- If a permission truly has to become required, add it to the lock **in the
  same commit** as the manifest change (CI fails a commit that changes the lock
  without `package.json` or `src/contents/`), and plan the release: users will
  see FlexTab disabled until they accept.
- Removing a permission passes; drop it from the lock in the same commit. A
  removed permission left in the lock could later come back unnoticed, and
  users who installed in between never granted it.

## Versioning

- **Single source of truth: `package.json` `version`**, written by release-please.
  Never edit it or the manifest version by hand.
- **Store rule:** a version is dot-separated integers (each 0-65535), strictly
  higher than the one published. No `-beta.1` suffixes: the stores reject them.
- **Scheme:** `0.x.y` until the public launch. release-please bumps from the
  Conventional Commits on `main` (`bump-minor-pre-major`): `fix:` → patch,
  `feat:` → minor, a breaking change → minor while on 0.x.
- **Tags:** `vX.Y.Z`, created by release-please. Never create a bare four-part
  tag such as `v0.1.0.7`: release-please would read it as `0.1.0`.

## Stable release (release-please)

1. **Work reaches `main` from `dev` as a merge commit, never a squash.**
   release-please reads every Conventional Commit for the next version and the
   changelog; a squash leaves only the PR title. Never rebase.
2. **release-please keeps one Release PR on `main`** (`chore(main): release X.Y.Z`)
   with the next version and `CHANGELOG.md`, updated on every push to `main`.
   Ordinary pushes build nothing (`.github/workflows/release.yml`).
3. **Backend first.** Before merging the Release PR, every BE change the release
   needs is deployed to production and works with the previous extension
   version (expand, then contract).
4. **Merging the Release PR is the release.** It tags `vX.Y.Z` and creates the
   GitHub Release. Only then the release workflow runs the full verification
   (`verify.yml` with `browser: true` and the real API variables), builds the
   Chrome and Firefox zips once, attaches them to the GitHub Release, and:
   - **Chrome Web Store:** `scripts/cws-publish.mjs` uploads and submits a
     **staged publish** (API v2 `STAGED_PUBLISH`). After review it waits: press
     **Publish** in the dashboard when you are ready.
   - **AMO:** `scripts/amo-submit.mjs` submits a **listed** version with the
     tag's source code (`git archive`, which carries `SOURCE_BUILD.md`), required
     because the build is bundled and minified. The build is reproducible: the
     same commands on another machine give byte-identical files.
5. **After the release, merge `main` back into `dev`** (a merge commit), so the
   version bump and the `vX.Y.Z` tag are in `dev`'s history.
6. **A bad release is fixed forward.** The stores have no rollback: revert the
   change on `dev`, bring it to `main`, and release a higher version.

The first release-please run starts from `bootstrap-sha` in
`release-please-config.json` (the tip of `main` when this was set up) with the
manifest at 0.1.0; the first merged Release PR creates the first stable tag.

### Storage fixture (every release)

Each release adds what it leaves in browser storage as a test fixture, so every
later version is tested to load it. From the release's own build:

```bash
node scripts/capture-storage-fixture.mjs --build=build/chrome-mv3-prod --version=X.Y.Z
# writes src/test/fixtures/storage/vX.Y.Z.json; commit it with the release
```

`src/test/storageFixtures.test.ts` loads every fixture through the app's real
hydration (workspace, UI selection, settings, sign-in). Never edit or delete an
old fixture: a failing one means the new version breaks data users already have,
so add a migration instead.

## One-time setup for releases

- **Repository variables** (public build configuration): `PLASMO_PUBLIC_API_URL`
  (the deployed API) and `PLASMO_PUBLIC_API_HOST` (its match pattern ending in `/*`).
- **First versions by hand:** neither store API can create an item. Upload the
  first stable version once in the Chrome Web Store Developer Dashboard and in
  the AMO Developer Hub (listing, categories, privacy policy URL); the workflow
  adds every later version.
- **Secrets** (each store step is skipped with a notice until they exist):
  - Chrome Web Store API v2: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`,
    `CWS_REFRESH_TOKEN` (an OAuth client with the Chrome Web Store scope),
    `CWS_PUBLISHER_ID`, `CWS_ITEM_ID`.
  - AMO: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` (AMO API credentials, from
    "Manage API Keys" in the AMO Developer Hub).

Push (main, dev) and PR CI uses the same verification job with
`api.example.invalid` and without the browser suite, plus the Conventional
Commit, pinned-action and permission checks; those zips are build fixtures and
must never reach a store. Where each suite runs is in
[quality gates](docs/quality-gates.md#where-each-suite-runs).

## Prerequisites

- **Prod env / config** (FE `.env.production`, BE `config.Validate`, CORS,
  OAuth redirect): the backend host is env-driven and the build guard blocks
  localhost. `.env.example` is the tracked template.
- **Google OAuth:** while the consent screen is in Testing mode, only listed
  test users can sign in with Google; publish it before a public release.

## What ships in a build

`npm run build:zip -- --channel=stable` bundles the prod extension (newtab override, popup,
background worker) into `build/chrome-mv3-prod.zip`. The backend is deployed
separately (Go + Postgres + Redis) — the extension only talks to it over the
env-configured API host.
