# FlexTab — Privacy Policy

_Last updated: 19 October 2026_

FlexTab is a browser extension that replaces your new tab page with a workspace to save, organize, and sync your tabs across devices. This policy explains what data FlexTab handles and why.

## What we collect

- **Account information** — email registration uses your name, email address, and a password stored as a hash on our backend. Google or GitHub sign-in provides a provider account identifier, name, email address, and profile image when available.
- **Saved workspace** — the URLs, titles, favicons, and organization of tabs you save, plus your preferences.
- **Open tabs** — the extension reads titles, URLs, and favicons on your device to display and save tabs. It does not automatically upload your whole open-tab list to FlexTab. Remote favicon requests are described below.
- **Account operations** — signed-in requests can include a per-install identifier and browser User-Agent. We keep device activity, session records, and security events to operate and protect accounts.
- **Billing** — checkout uses your account identifier, name, email, and selected plan. We receive payment status and provider transaction, customer, or subscription identifiers, plus amounts, billing dates, and card brand/last four digits when supplied. Payment details are entered on the payment provider’s hosted checkout.

The extension does not read your browser history database, keystrokes, form entries, or visited page content. The extension and landing site do not use advertising trackers. The backend also supports account-linked open/save activity events containing a URL, title, and time if an API client submits them; the current extension does not automatically submit these events.

## Where your data is stored

- **On your device** — your workspace is saved locally using `chrome.storage.local`. You can organize it without a FlexTab account.
- **Browser sync** — UI preferences and selected/expanded workspace identifiers can use `chrome.storage.sync`, including in guest mode. Browser-account settings control this service. It is separate from FlexTab workspace sync and does not carry the saved workspace tree.
- **FlexTab backend** — signed-in workspace sync sends saved workspace data to `api.flextabmanager.com`, where it is associated with your account and retained cloud versions. Account preferences can sync separately. Turning off Auto-sync does not stop authentication, account, settings, or billing requests.

## Network requests, including guest mode

Local organizing works offline, but guest mode is not a network-free mode. Onboarding can contact the FlexTab API to discover available sign-in providers. Browser sync can transfer preferences when enabled by your browser.

Displaying or converting a remote favicon can contact its image host, even for an unsaved open tab. Conversion can keep the original remote URL if it fails. Signed-in profile pictures can also load from an external host. Image hosts receive your IP address, the requested image URL, and browser request headers; referrer information depends on the browser and request. These requests do not require workspace sync.

## How we use your data

We use data to provide authentication, workspace storage and sync, account preferences, billing, security, and support. We do not sell or rent your personal data or use it for advertising. The services below receive data needed for the functions you use.

If you create a workspace share link through an API client, the shared content is accessible to anyone with that link until it expires or is revoked.

## Third-party services

- **Google or GitHub** — when you choose that sign-in method, the provider handles authentication and shares the account information listed above with FlexTab. See [Google’s Privacy Policy](https://policies.google.com/privacy) and [GitHub’s Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). Available methods depend on server configuration.
- **Lemon Squeezy or iPaymu** — the configured payment provider receives your name, email, FlexTab account reference, and selected product/plan and price as needed to start checkout. Data can be sent before a purchase is completed. The provider processes payment and returns billing records to FlexTab. See [Lemon Squeezy’s Privacy Policy](https://www.lemonsqueezy.com/privacy) and [iPaymu’s Privacy Policy](https://ipaymu.com/en/privacy-policy/).
- **Browser sync and image hosts** — your browser’s sync service and the hosts of remote favicons/profile images receive the data described above when those features make requests. Image hosts depend on the tabs and profile images being displayed.

## Data retention and deletion

Saved workspace data remains available while stored in your account. Deleting a saved item removes it from the current workspace after successful sync, but earlier copies can remain in retained cloud versions. History is limited by version count under your plan; it is not a guaranteed number of days.

Contact us below to request account/data deletion and information about retained records. Signing out or uninstalling does not delete your cloud account or cancel a subscription. Payment providers handle their own records under their policies. This policy does not promise immediate removal of every historical, security, or payment record.

## Permissions we request

- `tabs` — to read open tab titles, URLs, and favicons so you can view and save them.
- `storage` and `unlimitedStorage` — to store the workspace and preferences; browser sync is used for the limited UI state described above.
- `alarms` — to schedule background sync work.
- API host access — for authentication, workspace sync, account settings, and billing. This permission list does not mean image requests can only reach the API host.

## Children's privacy

FlexTab is not directed at children under 13 and we do not knowingly collect data from them.

## Changes to this policy

We may update this policy; material changes will be reflected by the “Last updated” date above.

## Contact

Questions or data-deletion requests: [greezyzilla@gmail.com](mailto:greezyzilla@gmail.com).
