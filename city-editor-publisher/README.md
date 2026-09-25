# City editor publisher

This Node service is the only component allowed to commit editor documents. The static City Explorer never receives a GitHub credential. It keeps a local recovery draft before each publication attempt.

## GitHub setup

Create a GitHub App owned by `edmondsonedits`, install it on **only** `edmondsonedits/Peterborough-Map-Game`, and enable user authorization. Set its callback to the public HTTPS URL of this service ending in `/auth/callback`. Give the app repository **Contents: read and write** and **Deployments: read**. GitHub supplies **Metadata: read** automatically. Do not request broad OAuth repository scopes. The service checks the signed-in GitHub login against `edmondsonedits` and writes only `city-explorer/data/editor/peterborough-details.json` on `main`.

## Required deployment environment

| Variable | Purpose |
| --- | --- |
| `CITY_EDITOR_GITHUB_APP_CLIENT_ID` | GitHub App client ID |
| `CITY_EDITOR_GITHUB_APP_CLIENT_SECRET` | GitHub App client secret |
| `CITY_EDITOR_SESSION_SECRET` | Random signing secret of at least 32 characters |
| `CITY_EDITOR_ORIGIN` | Exact HTTPS origin of the City Explorer, with no path or trailing slash |
| `CITY_EDITOR_CALLBACK_URL` | Public HTTPS publisher URL ending in `/auth/callback`; must match the GitHub App callback |
| `CITY_EDITOR_RETURN_URL` | Full HTTPS City Explorer URL to return to after login; must have the configured origin |
| `PORT` | Optional local listener port; defaults to 8787 |

Run with Node 20 or newer using `npm start` from this directory. Put the service behind HTTPS. `GET /health` returns `{ "ok": true }` for a health check. Use one service instance: OAuth state and owner sessions are held in memory, so a restart signs owners out. Do not log request headers, bodies, or token exchange results. Protect the environment in the deployment platform and restrict who may change it.

Set the static page's `meta[name="city-editor-publisher"]` content to the public HTTPS publisher base URL after the service is deployed. An empty value leaves Save Version disabled at the service layer while preserving the local draft. The site origin must match `CITY_EDITOR_ORIGIN` exactly. Credentialed cross-origin requests need browser cookies; for browsers that block third-party cookies, serve the publisher from a same-site HTTPS domain. The session cookie is signed, Secure, HttpOnly, SameSite=None, and expires after eight hours. Writes require the exact configured Origin and a per-session CSRF token.

The GitHub Pages workflow must create `github-pages` deployments for the commit. The status route reads that deployment's latest status; a missing deployment remains `deploying` until the editor's bounded polling ends. No live status is inferred from a successful Contents API write alone.

OAuth starts are limited to 64 pending states and owner sessions to 32. Expired entries are removed by a one-minute sweep and when auth routes run; stopping the service clears both stores. Excess login starts receive `429` until capacity is released. If a commit succeeds but deployment status cannot be checked, the editor still reports the saved commit SHA and marks deployment status unavailable.

To rotate credentials, update the GitHub App client secret and/or `CITY_EDITOR_SESSION_SECRET` in the deployment platform, restart the single service instance, then revoke the old GitHub App secret. Rotating the session secret signs out all owners. Never put the secrets in the static page, repository, logs, or a URL.

Run `node tools/test_city_editor_publisher.mjs` and `node tools/test_city_editor_publisher_client.mjs` from the repository root to exercise authorization, validation, GitHub failures, stale edits, and client recovery behavior with mocked GitHub HTTP.

GitHub references: [GitHub App user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [authorization flow](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-login-with-github-button-with-a-github-app), and [deployment status permissions](https://docs.github.com/en/rest/deployments/deployments).
