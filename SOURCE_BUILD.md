# Building FlexTab from source (for AMO reviewers)

This archive is the source of the FlexTab version you are reviewing, taken from
its release tag. The submitted add-on is bundled and minified by Plasmo
(Parcel); building it as below produces the same files.

## Environment

- Ubuntu 24.04 (any OS with the tools below works)
- Node.js **24.14.0** and npm **11.9.0**, pinned in `package.json`
  (`devEngines`) and `.nvmrc`: https://nodejs.org/dist/v24.14.0/
- No other tools. Every dependency is open source and installed from
  `package-lock.json`.

## Build

```bash
npm ci
export PLASMO_PUBLIC_API_URL=https://api.flextabmanager.com
export PLASMO_PUBLIC_API_HOST='https://api.flextabmanager.com/*'
npm run build:zip -- --channel=stable --target=firefox-mv3
```

The add-on is `build/firefox-mv3-prod/` (zipped as
`build/firefox-mv3-prod.zip`). The two variables are public: the address of
FlexTab's API, which the extension talks to.

## Where things are

- `src/` the extension: new tab page (`src/newtab`), popup (`src/popup`),
  background script (`src/background.ts`), content script that completes
  sign-in on FlexTab's own API pages (`src/contents/auth-capture.ts`).
- `scripts/build.mjs` the build entry used above (channel, Firefox target).
- `PRIVACY.md` what FlexTab sends and why.
