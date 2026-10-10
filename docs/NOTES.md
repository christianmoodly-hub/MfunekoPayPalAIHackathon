# Notes

Research for Milestone M0. PayPal calls in `src/lib/paypal` follow these pages. Checked 2026-10-09.

## Orders v2

- Create order: https://developer.paypal.com/api/orders/v2/orders-create
- Confirm payment source: https://developer.paypal.com/api/orders/v2/orders-confirm
- Capture payment: https://developer.paypal.com/api/orders/v2/orders-capture
- How the Orders API is used: https://developer.paypal.com/api/rest/integration/orders-api/
- PayPal wallet checkout samples: https://developer.paypal.com/api/rest/integration/orders-api/api-use-cases/standard/
- Card checkout samples: https://developer.paypal.com/api/rest/integration/orders-api/api-use-cases/advanced/
- Sandbox test cards: https://developer.paypal.com/sandbox-testing/card-testing

Sandbox base URL is `https://api-m.sandbox.paypal.com`. Access tokens come from `POST /v1/oauth2/token` with HTTP Basic client credentials and `grant_type=client_credentials`. The create-order reference lists that token URL for the client-credentials flow.

Create order is `POST /v2/checkout/orders`. A capture-intent order needs `intent: "CAPTURE"` and at least one purchase unit with `amount.currency_code` and `amount.value`. Amounts are decimal strings. A successful create with no payment source returns status `CREATED`, HTTP 201, and HATEOAS links. The buyer approval link is `rel: "approve"` (`https://www.sandbox.paypal.com/checkoutnow?token=ORDER_ID`). Orders stay in `CREATED` for about 3 hours.

Capture is `POST /v2/checkout/orders/{id}/capture`. The capture reference says the buyer must approve the order first, or the request must include a valid `payment_source`. An empty JSON body is enough when the payment source was already confirmed. A successful capture returns status `COMPLETED`.

PayPal wallet approval cannot be completed with the client id and secret alone. Creating an order with `payment_source.paypal` returns status `PAYER_ACTION_REQUIRED` and a `rel: "payer-action"` link. Someone has to open that page and sign in with a sandbox personal account.

Card payments can skip that login. The expanded-checkout guide says explicit buyer approval is not required for cards. The hello-order script uses that path:

1. Create a $5.00 USD order with no payment source.
2. `POST /v2/checkout/orders/{id}/confirm-payment-source` with a sandbox test card. The sample response status is `APPROVED`.
3. Capture with an empty body.

The test card is Visa `4012888888881881` from the card-testing page, with expiry `2028-12`, CVV `123`, and a US billing address. The number in PayPal's JSON samples (`1111111111111111`) is a placeholder, so the script uses the published test number instead. The card number is not written to the ledger.

If confirm returns `PAYER_ACTION_REQUIRED`, or PayPal rejects the card, the script prints the approval URL and stops before capture. Resume with `npm run hello-order -- --capture ORDER_ID` after the payment is approved. Card processing can fail when the sandbox REST app is not enabled for expanded checkout. That case uses the same manual approval step.

## Agent toolkit and MCP

- Toolkit quickstart: https://developer.paypal.com/ai-tools/toolkit
- Tool reference: https://developer.paypal.com/ai-tools/agent-tools
- MCP package: https://www.npmjs.com/package/@paypal/mcp

`@paypal/agent-toolkit` exposes PayPal operations as tools for Bedrock, LangChain, OpenAI Agents, Vercel AI SDK, and MCP. The local MCP server is `npx -y @paypal/mcp --tools=all` with `PAYPAL_ENVIRONMENT=SANDBOX`. Payment tools include `create_order` (items, quantity, unit price, currency), `get_order`, and `pay_order` (capture by order id). `pay_order` does not approve the buyer. It captures an order that is already authorized or approved.

M0 does not use the toolkit or MCP. The hello order is deterministic code, and the same Orders v2 calls are made directly from `src/lib/paypal`. Leaving payment tools on an LLM would conflict with the rule that the model never decides whether money is spent.

## Hello order

```bash
cp .env.example .env
npm run db:migrate
npm run hello-order
```

`PAYPAL_ENV` must be `sandbox`. Ledger rows use a null `mandate_id` and one of: `paypal.order.created`, `paypal.order.confirmed`, `paypal.order.payer_action_required`, `paypal.order.captured`, `paypal.order.failed`. The ledger amount is copied from the order's first purchase unit. It is not hardcoded.

`PayPal-Request-Id` is a SHA-256 prefix of a caller-supplied key, not a random UUID. Orders v2 stores that id for about 6 hours ([idempotency](https://developer.paypal.com/api/rest/reference/idempotency)). The hello-order create key is `hello-order:create`, so a repeat run inside that window returns the same order. Access tokens are reused until 60 seconds before `expires_in`, then refreshed ([authentication](https://developer.paypal.com/api/rest/authentication)).

## Saved PayPal wallet (not implemented)

Checked 2026-10-09. This is the flow for "buyer consents once, later orders reuse the saved method."

- Overview: https://developer.paypal.com/docs/checkout/save-payment-methods/
- Save a PayPal wallet with no purchase, then charge later: https://developer.paypal.com/docs/checkout/save-payment-methods/purchase-later/payment-tokens-api/paypal/
- Use a saved token on an Orders v2 create: https://developer.paypal.com/api/save-with-purchase/save-payment-methods
- Save during a purchase with `payment_source.paypal.attributes.vault`: https://developer.paypal.com/checkout/save-customer-info

The first step does not work without the buyer. `POST /v3/vault/setup-tokens` with `payment_source.paypal` returns `PAYER_ACTION_REQUIRED` and an `approve` link (`https://sandbox.paypal.com/agreements/approve?approval_session_id=...`). The buyer signs in and accepts a billing agreement. `usage_type` must be `MERCHANT` for merchant-initiated later charges. The setup token expires after about 3 days. After approval, `POST /v3/vault/payment-tokens` exchanges it for a payment token id.

Later charges can omit the buyer. `POST /v2/checkout/orders` with `intent: "CAPTURE"` and `payment_source.paypal.vault_id` set to that token is documented to create an order on behalf of the payer. The sample response status is `COMPLETED`. The same page says the payer does not need to be present when charged.

Sandbox setup is a dashboard toggle: the REST app's advanced options must have Vault selected. The guide also says saving a PayPal wallet can require a billing-agreement review ("contact your account manager"). A hackathon sandbox app may not be eligible until that is approved. That part was not tried against this app.

Recommendation: use this for repeat sandbox charges after one human approval, and keep the policy engine in front of every charge. Do not use it for the first hello-order. Store only the payment token id and PayPal customer id after the buyer approves. Do not implement it until a sandbox app is confirmed to have Vault enabled.

## Gemini structured output

Checked 2026-10-09.

- Structured output (JSON schema): https://ai.google.dev/gemini-api/docs/structured-output
- Model list: https://ai.google.dev/gemini-api/docs/models
- Gemini 3.8 Flash: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- API key auth: https://ai.google.dev/gemini-api/docs/api-key

The structured-output page uses the Interactions API. The JavaScript example calls `client.interactions.create` from `@google/genai` with `response_format: { type: "text", mime_type: "application/json", schema }`. The sample model is `gemini-3.8-flash`. `responseSchema` and `response_mime_type` are deprecated in favor of `response_format`.

The models page (updated 2026-10-06) lists current text models including `gemini-3.8-flash` (stable Flash), `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`, and `gemini-3-flash-preview`. New projects should use a current model. `GEMINI_MODEL` in `.env.example` is `gemini-3.8-flash`. The code does not hardcode a model name.

The API key is read from `GEMINI_API_KEY` at request time. It is not written to the ledger, logs, or the database. Error text that looks like an API key (`AIza…`), a `key=` query value, or a `postgres://` URL is redacted before it is stored or returned.

```bash
npm run db:migrate
npm run parse-mandate -- "buy office supplies under 50 dollars"
```

The script needs `DATABASE_URL`, `GEMINI_API_KEY`, and `GEMINI_MODEL`. It saves a draft mandate and writes `mandate.parse_requested` and `mandate.parsed`. A failed parse writes `mandate.parse_failed`. Confirming a draft in the app writes `mandate.confirmed` and sets status to `active`.

## Channel3 search

Checked 2026-10-10.

- Search API (OpenAPI for `POST /v1/search`): https://docs.trychannel3.com/api-reference/v1/search
- Search response guide: https://docs.trychannel3.com/guides/response-overview
- Product guide: https://docs.trychannel3.com/guides/product
- Offer guide: https://docs.trychannel3.com/guides/offer
- Product detail: https://docs.trychannel3.com/api-reference/v1/product-detail
- Make a search: https://docs.trychannel3.com/guides/make-a-search

Base URL is `https://api.trychannel3.com`. Search is `POST /v1/search` with header `x-api-key`. The client asks for `config.currency=USD`, `country=US`, and `language=en`, and limits the page to 10 products.

The OpenAPI `Product` requires `id` and `title`. Optional fields used here are `description`, `brands` (`id`, `name`), `category` (`slug`, `title`, `has_children`), and `offers`.

The OpenAPI `ProductOffer` requires `url`, `domain`, `price`, and `availability` (`InStock` or `OutOfStock`). `Price` requires `price` (number, current amount in major units) and `currency`. `compare_at_price` is optional. The offer guide's JSON example uses `price.amount` instead of `price.price`. The client follows the OpenAPI schema and rejects the `amount` shape.

What the docs show for the fields this app needs:

- Price and currency: yes, on the offer, as `price.price` and `price.currency`. Not on the product.
- Merchant name: no name field on the offer. The stable merchant value on the offer is `domain`. `brands[].name` is the product brand, not the retailer. Search filters accept website ids or domains, but the offer object does not return a website id.
- Stable product id: yes, `product.id`.
- Category: yes, optional `category.slug` and `category.title`. The category can be null.
- Return policy: no field on the product or the offer. The commissions FAQ mentions a retailer return window for payouts, which is not a free-returns flag.
- Shipping or delivery estimate: no field. `dimensions` is physical size and weight, not a delivery date.

`src/lib/shopping` therefore sets `freeReturns` to false and `deliveryDate` to null. Merchant allow and block lists are compared to the normalized offer domain, including a leading `www.`. Prior spend is the sum of `paypal.order.captured` ledger amounts for the mandate. Gemini ranking returns only `productId`, `quantity`, and `reasoning`.

```bash
npm run shop -- <mandateId> "office paper"
```
