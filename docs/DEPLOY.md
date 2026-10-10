# Deploy Mandate on Render

This is the path from an empty Render account to a running sandbox demo. PayPal stays in sandbox. No live charges.

The Blueprint is `render.yaml`. It creates one web service, `mandate`, and one Postgres database, `mandate-db`.

## What the plan can do

Checked against [Render deploys](https://render.com/docs/deploys#pre-deploy-command) and [web services](https://render.com/docs/web-services) on 2026-10-10.

- A pre-deploy command runs after the build and before the new instance starts. Render recommends it for database migrations. It runs on its own instance, so files it writes are not kept. It uses pipeline minutes and has a 30 minute limit.
- Pre-deploy commands are available for paid web services, private services, and background workers. A free web service does not run `preDeployCommand`.
- The web service in this Blueprint uses plan `0.5c-512mb`, the smallest paid web plan listed in the web services docs. That plan runs `npm run db:migrate` on every deploy and does not spin down after 15 idle minutes.
- Postgres uses the free plan. [Free Postgres expires after 30 days](https://render.com/docs/free), and the filesystem on the web service is ephemeral. The ledger and mandates live in Postgres.
- If you change the web service to `free`, delete `preDeployCommand` and put the migrate step in the start command (`npm run db:migrate && npm start -- -H 0.0.0.0 -p $PORT`). Free instances also sleep after 15 minutes without traffic.

## 1. Render account and Git

1. Create a workspace at [dashboard.render.com](https://dashboard.render.com).
2. Push this repo to GitHub, GitLab, or Bitbucket. Render reads `render.yaml` from that repo.
3. In the Dashboard, choose **New** → **Blueprint**.
4. Connect the Git provider and select this repository. Render opens the Blueprint from `render.yaml`.

You can also open `https://dashboard.render.com/blueprint/new?repo=<HTTPS repo URL>` after the file is on the default branch.

## 2. Fill the secrets

Render asks for every env var marked `sync: false`. Set them before the first apply:

| Name | Value |
| --- | --- |
| `APP_URL` | The public origin Render will serve, with `https://` and no path. After you name the service `mandate`, this is usually `https://mandate.onrender.com`. If that hostname is taken, use the hostname Render actually assigns. |
| `DEMO_PASSCODE` | The gate password for `/enter`. |
| `GEMINI_API_KEY` | Gemini API key. |
| `CHANNEL3_API_KEY` | Channel3 API key. |
| `PAYPAL_CLIENT_ID` | Sandbox REST app client id. |
| `PAYPAL_CLIENT_SECRET` | Sandbox REST app secret. |

These are already set by the Blueprint and should be left as written:

- `DATABASE_URL` comes from `mandate-db`. The Blueprint allows database connections from anywhere (`0.0.0.0/0`), which is Render's default, so the web service and a one-time local client can use the external connection string.
- `GEMINI_MODEL` is `gemini-3.8-flash`.
- `PAYPAL_ENV` is `sandbox`.

Do not set `PAYPAL_ENV` to `live`. In production the process refuses to start unless `APP_URL` is a public `https` origin, `DEMO_PASSCODE` is set, and `PAYPAL_ENV` is exactly `sandbox`.

`APP_URL` has to match the public site. PayPal return, cancel, and vault-link URLs are built from it. They are not taken from the incoming request host and there is no localhost fallback. If the first deploy fails because `APP_URL` was a guess, set the hostname shown on the service page and deploy again.

## 3. Apply and check the deploy

1. Apply the Blueprint.
2. Wait until the web service deploy is live. The pre-deploy log should show `npm run db:migrate` before the start command.
3. Open `https://<your-host>/api/health`. It returns `{ "ok": true }` and does not ask for the passcode. Render uses that path as `healthCheckPath`.

The service listens on `0.0.0.0` and Render's `PORT`.

## 4. One-time sandbox wallet link

The saved wallet is not created by the deploy. Do this once in a browser:

1. Open `https://<your-host>/enter` and submit `DEMO_PASSCODE`.
2. Open `/wallet`.
3. Choose **Connect with PayPal**. The app sends PayPal a return URL of `APP_URL/api/paypal/link/return` and a cancel URL of `APP_URL/wallet?linked=0`.
4. Sign in with a **sandbox Personal account** (the buyer), not with the REST app's client id.
5. Approve the billing agreement. PayPal sends the browser back to the wallet page. The vault id stays on the server. The page shows a fingerprint.

`POST /api/session` allows 5 attempts per IP per 10 minutes. A failed attempt waits half a second before it answers. The limit is stored in memory for that one instance, so a restart clears it.

The client IP is the last `X-Forwarded-For` hop. This app trusts one proxy, Render's edge, and treats the last hop as the address that proxy recorded. Earlier hops are ignored because a caller can set them. See the note in `src/lib/auth/rate-limit.ts`.

## 5. Sandbox buyer account

Create or view the buyer in the PayPal Developer Dashboard, not in the live PayPal site.

1. Open [Sandbox accounts](https://developer.paypal.com/tools/sandbox/accounts/).
2. Use a **Personal** account, or create one. The REST app you used for `PAYPAL_CLIENT_ID` belongs to a **Business** sandbox account. The buyer must be a different Personal account.
3. Open the Personal account and view its email and system-generated password. Those are the credentials for the PayPal approval page in step 4.
4. If **Connect with PayPal** returns an error that vault is not enabled, turn on vault or payment tokens for that sandbox REST app, then try the link again.

Card testing numbers, if you run `npm run hello-order` against this sandbox app, are listed at [PayPal card testing](https://developer.paypal.com/sandbox-testing/card-testing). The hosted demo does not need that script. Checkout in the app uses the linked wallet or a per-order buyer approval, still in sandbox.

## Local use of the same variables

Copy `.env.example` to `.env`. For local PayPal redirects set `APP_URL` to the origin you actually open, such as `http://localhost:3000`. Production startup rejects that value. `next dev` does not.
