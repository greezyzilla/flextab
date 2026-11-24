# Releasing FlexTab (Chrome Web Store)

Runbook for cutting an extension release and uploading the ZIP to the CWS.

## Channels: FlexTab Beta and FlexTab

One codebase builds two permanent, separate extension items (design in
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
npm run release:beta          # on dev: checks, builds build/chrome-mv3-beta.zip, tags
git push origin beta-vX.Y.Z.N # when ready; the script never pushes
```

`scripts/release-beta.mjs` checks that HEAD is on `dev`, the working tree is
clean, a stable tag `vX.Y.Z` is in the history, there are commits since it, and
the new version is above every earlier beta tag in `dev`'s history. `X.Y.Z` is
that stable tag and `N` the number of commits since it. It then runs check-env
and the beta build, and only after the build succeeds creates the annotated tag
`beta-vX.Y.Z.N`. Any failure aborts with no tag left behind. Until the first
stable release exists there is no stable tag, so no beta can be cut.

Before pushing the tag, deploy every BE change the beta needs: both channels
share the production BE, and it must keep working for the stable version too.

Pushing the tag runs `.github/workflows/beta.yml`:

1. **validate** (`scripts/check-beta-tag.mjs`), before anything is built: the
   format, the commit being on `dev`, and the version being above every earlier
   beta released from `dev`. A refused tag can be deleted and redone.
2. **verify**: `verify.yml` with `browser: true` and the tag, building the Chrome
   and Firefox beta zips (Firefox linted as self-hosted, permissions checked).
3. **publish**:
   - a **GitHub pre-release** for the tag with `flextab-beta-X.Y.Z.N-chrome.zip`;
   - the **FlexTab Beta** Web Store item gets the upload as a default publish:
     live for the testers as soon as it is approved;
   - Firefox: AMO signs the build as **unlisted** (`scripts/amo-submit.mjs
     --channel=unlisted`); the signed `flextab-beta-X.Y.Z.N.xpi` goes on the
     pre-release, and `updates.json` on the permanent **`firefox-beta`** release
     is replaced. Firefox Beta's `gecko.update_url` points at that fixed address
     (`scripts/channel.mjs` `BETA_UPDATE_URL`; GitHub's `releases/latest` skips
     pre-releases), so installed copies update themselves. Never delete the
     `firefox-beta` release.

### Setting up the beta once (manual steps)

1. **Chrome Web Store, FlexTab Beta item:** in the Developer Dashboard create a
   new item and upload the first beta zip by hand (the API cannot create items).
   Name it FlexTab Beta with the Beta icon, set visibility to **Private**, and
   under "Testers" add the **Google Group** of internal testers. Copy its item ID
   into the `CWS_BETA_ITEM_ID` secret (the CWS API secrets are shared with stable,
   see "One-time setup for releases").
2. **Google Group:** create it (for example flextab-beta@googlegroups.com), add
   the testers, and keep membership invite-only. Testers install from the item's
   link while signed in to Chrome with an address in the group.
3. **AMO keys:** in the AMO Developer Hub, under "Manage API Keys", generate a
   JWT issuer and secret and store them as `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`
   (shared with stable). The beta add-on id `flextab-beta@flextabmanager.com` is
   created on AMO by the first unlisted signing.
4. **Google OAuth test users:** while the OAuth consent screen is in Testing
   mode, only listed test users can sign in with Google. Add every tester's
   Google address under "Test users" in the Google Cloud console (OAuth consent
   screen), or publish the consent screen before inviting testers.
5. **Firefox testers, first install:** send them the pre-release page; they open
   `flextab-beta-X.Y.Z.N.xpi` in Firefox 140+ and accept. Later betas arrive by
   themselves through `updates.json`.
6. **Prove one real update** before relying on it: install beta N on Chrome and
   Firefox, sign in, save tabs, release beta N+1, and check that it arrives,
   sign-in stays, and local data and sync are intact.

## Firefox build

The same code builds for Firefox with `--target=firefox-mv3`, for
either channel. Plasmo turns the background service worker into Firefox's event
page; package.json `manifest.overrides.firefox` drops the Chrome-only `favicon`
permission; `browser_specific_settings.gecko` (kept for Firefox only) sets the
add-on id per channel, `strict_min_version` 140.0 (the ESR, and the first with
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
  runs it after the stable, beta and Firefox builds. A required addition fails
  and is named.
- If a permission truly has to become required, add it to the lock **in the
  same commit** as the manifest change (CI fails a commit that changes the lock
  without `package.json` or `src/contents/`), and plan the release: users will
  see FlexTab disabled until they accept.
- Removing a permission passes; drop it from the lock in the same commit. A
  removed permission left in the lock could later come back unnoticed, and
  users who installed in between never granted it.

## Versioning

- **Single source of truth: `package.json` `version`**, written by release-please
  (stable) or by the beta tag. Never edit it or the manifest version by hand.
- **Store rule:** a version is dot-separated integers (each 0-65535), strictly
  higher than the one published. No `-beta.1` suffixes: the stores reject them.
- **Scheme:** `0.x.y` until the public launch. release-please bumps from the
  Conventional Commits on `main` (`bump-minor-pre-major`): `fix:` → patch,
  `feat:` → minor, a breaking change → minor while on 0.x.
- **Tags:** stable `vX.Y.Z` (release-please), beta `beta-vX.Y.Z.N` (release:beta).
  release-please skips `beta-` tags. Never create a bare four-part tag such as
  `v0.1.0.7`: release-please would read it as `0.1.0`.

## Stable release (release-please)

1. **Work reaches `main` from `dev` as a merge commit, never a squash.**
   release-please reads every Conventional Commit for the next version and the
   changelog; a squash leaves only the PR title. Never rebase.
2. **release-please keeps one Release PR on `main`** (`chore(main): release X.Y.Z`)
   with the next version and `CHANGELOG.md`, updated on every push to `main`.
   Ordinary pushes build nothing (`.github/workflows/release.yml`).
3. **Backend first.** Before merging the Release PR, every BE change the release
   needs is deployed to production and works with the previous extension
   version (expand, then contract). Both channels share that one BE.
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
   version bump and the `vX.Y.Z` tag are in `dev`'s history: `release:beta`
   counts beta numbers from the last stable tag it can reach.
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
    `CWS_PUBLISHER_ID`, `CWS_ITEM_ID` (the stable item), `CWS_BETA_ITEM_ID`
    (the FlexTab Beta item, see "Setting up the beta once").
  - AMO: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` (AMO API credentials).

Push (main, dev) and PR CI uses the same verification job with
`api.example.invalid` and without the browser suite, plus the Conventional
Commit, pinned-action and permission checks; those zips are build fixtures and
must never reach a store. Where each suite runs is in
[quality gates](docs/quality-gates.md#where-each-suite-runs).

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
