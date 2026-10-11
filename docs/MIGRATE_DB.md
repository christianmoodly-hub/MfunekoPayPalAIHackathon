# Deployed database migration plan

This plan changes the Render web service to a new Postgres database. `render.yaml` runs `npm run db:migrate` during the build before starting the app. Keep the old database available until the new deployment passes smoke checks.

## First swap: around November 4, 2026

1. In Render, create a new managed PostgreSQL database in the same region as the `mandate` web service. Wait until its status is available.
2. Open the new database's Connect page and copy its **internal** connection URL. Keep it in a password manager or clipboard; never commit it or paste it into an issue or log.
3. Open the `mandate` web service in Render, then **Environment**. Replace only `DATABASE_URL` with the new database's internal URL and save the change. Leave `DEMO_PASSCODE`, PayPal, Gemini, Channel3, and `APP_URL` values as they are.
4. Trigger a deploy of the intended commit (or let the environment change trigger it). Watch the build log to confirm `npm run db:migrate` completes before `npm start`.
5. After deploy succeeds, re-link the PayPal wallet: open the deployed app, sign in with `DEMO_PASSCODE`, go to Wallet, start linking, and approve using the PayPal **sandbox personal account**. Confirm the UI says the wallet is linked.
6. From a trusted machine with `DEMO_PASSCODE` set locally, run `npm run smoke -- https://<deployed-host>`. Require PASS for gate, health, database/migrations, and wallet. Do not use `--run` unless a real Channel3/Gemini shopping run is intended; it creates permanent test records.
7. Keep the previous database intact until the smoke checks pass and the app has been reviewed. Then archive or retire it according to the project backup policy.

## Second swap: November 25–28, 2026

Repeat the same seven steps with the next new Postgres instance. Use the latest intended deploy, update `DATABASE_URL` on the Render web service, verify build-time migrations, re-link through the sandbox personal account, and run smoke before retiring the prior database.

Each new database starts with a fresh schema and data set unless rows are copied separately. This plan intentionally creates a clean database; it does not transfer existing mandates, ledger history, runs, approvals, or saved wallet records. The PayPal wallet must be linked again after either swap.
