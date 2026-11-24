# FlexTab

Your tabs, finally organized.

FlexTab is a browser extension that turns the new tab page into a quiet home for
the tabs you mean to come back to. Save what is open, sort it into spaces,
projects and groups, and reopen a whole set of tabs when you return to the work.

**Website:** [flextabmanager.com](https://flextabmanager.com)

## What it does

- **New tab workspace.** Your saved tabs live on the new tab page, next to the
  tabs that are open right now.
- **Organized by the work.** Space > Project > Category > Group > Tab. Drag open
  tabs into a group, rearrange anything, open a whole group at once.
- **Quick access popup.** Save the current tab or window from the toolbar
  without opening the new tab page.
- **Local first.** Everything works without an account and stays in your browser.
- **Optional sync.** Sign in to keep your workspace in sync across devices, with
  version history to roll back to.

FlexTab is free to start. Paid plans raise the saved tab limit; see the website
for current plans.

## Privacy and terms

- [Privacy policy](PRIVACY.md)
- [Terms of service](TERMS.md)

Questions and data-deletion requests: support@flextabmanager.com

## Development

Built with [Plasmo](https://www.plasmo.com/), React, Zustand and Tailwind CSS.

```bash
nvm install
nvm use
npm ci
cp .env.example .env.development
npm run dev
```

Load `build/chrome-mv3-dev` as an unpacked extension in Chrome. The development
API defaults to localhost; configure `.env.development` for your backend.

The toolchain is pinned to Node 24.14.0 / npm 11.9.0 through `.nvmrc`,
`package.json` `devEngines` and `packageManager`. Change them together. Use
`devEngines`, not `engines.node`: Parcel reads `engines` to infer the bundle
target, and this extension must target browsers.

### Verify and build

```bash
npm run typecheck
npm run test:coverage -- --run
export PLASMO_PUBLIC_API_URL=https://api.example.com
export PLASMO_PUBLIC_API_HOST='https://api.example.com/*'
npm run build:zip -- --channel=stable
```

Output: `build/chrome-mv3-prod.zip`. `PLASMO_PUBLIC_*` values end up in the
public bundle, so never put secrets in them.

- Quality gates and coverage limits: [docs/quality-gates.md](docs/quality-gates.md)
- Versions, releases and store submission: [RELEASING.md](RELEASING.md)
- Building from source for store review: [SOURCE_BUILD.md](SOURCE_BUILD.md)
