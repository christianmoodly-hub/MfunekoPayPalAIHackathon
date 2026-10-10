# Mandate

Mandate is a shopping agent with spending rules that code enforces. You write a mandate in plain English. Gemini turns that text into structured limits. A shopping run searches Channel3, asks Gemini to pick one product, and builds a cart from the catalog data. A deterministic policy engine then approves, escalates, or blocks the purchase. Approved purchases are meant to be paid through the PayPal sandbox. Every step is written to an append-only ledger.

**The LLM proposes, deterministic code disposes.** The model never decides that money is spent. Gemini output is untrusted input. Prices, merchants, categories, return rules, and delivery dates are rebuilt on the server from Channel3. When Channel3 does not provide a field the mandate depends on, that field is set to a failing value and the policy engine blocks. PayPal is sandbox only.

## Setup

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

Put values in `.env` before `db:migrate`. `.env` is gitignored. `npm install` points Git at `.githooks`, which rejects a commit when a staged file contains a Postgres URL with a username and password, a Gemini API key, or a password assignment.

## Environment variables

`DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `CHANNEL3_API_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, `DEMO_PASSCODE`

`PAYPAL_ENV` must be `sandbox`.

## Demo access

Every page and API route checks `DEMO_PASSCODE`. Open `/enter`, submit the passcode, and the app sets an httpOnly `mandate_demo` cookie (`SameSite=Lax`, so a PayPal redirect back to this site still includes it). `POST /api/session` with `{ "passcode": "..." }` does the same thing. The cookie stores an HMAC of the passcode, not the passcode itself. If `DEMO_PASSCODE` is missing, API routes return 500 and pages stay on the gate.

`POST /api/mandates/parse` and `POST /api/runs` also allow 8 requests per minute per IP address. The counter lives in memory for that server process, so it resets on restart and is not shared across instances. A request past the limit gets `429` and `{ "error": "Too many requests." }`.

## Tools

- **Gemini** parses a mandate and ranks search candidates. The model name comes from `GEMINI_MODEL`. Both calls use JSON schema output and are checked with Zod. Ranking can return only a product id, a quantity, and a reasoning string.
- **Channel3** supplies products through `POST /v1/search`. Product titles and descriptions are treated as untrusted data.
- **PayPal Orders v2** (sandbox) creates and captures orders. `npm run hello-order` runs a card payment. `POST /api/paypal/link` starts a saved-wallet setup, and `npm run charge-vaulted -- <cents>` charges that wallet. Per-order buyer approval remains available when Vault is not enabled.
- **Render** hosts the app: a web service and Postgres. The database URL comes from the environment. The filesystem is not used for storage.
- **AG Grid** is the planned ledger view: sortable, filterable, expandable audit rows. The ledger is written now. The grid page is not built yet.

## Try a shopping run

Confirm a mandate in the app, then:

```bash
npm run shop -- <mandateId>
```

That uses the mandate's search query. Pass a query to override it: `npm run shop -- <mandateId> "office paper"`.

## Checks

```bash
npm test
npm run typecheck
npm run lint
```
