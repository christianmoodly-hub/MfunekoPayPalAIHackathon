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

## Saved PayPal wallet

Checked 2026-10-10.

- Save a PayPal wallet with no purchase, then charge later: https://developer.paypal.com/docs/checkout/save-payment-methods/purchase-later/payment-tokens-api/paypal/
- Create setup token reference: https://developer.paypal.com/api/payment-tokens/v3/setup-tokens-create
- Orders v2 create: https://developer.paypal.com/api/orders/v2/orders-create
- `experience_context` moved here from `application_context`: https://developer.paypal.com/api/rest/integration/orders-api/v1-v2-migration

The sample setup request includes a shipping address and `shipping_preference: "SET_PROVIDED_ADDRESS"`. This app has no ship-to address, so the setup request omits `shipping` and sets `shipping_preference` to `NO_SHIPPING`. The other fields match the guide.

`POST /v3/vault/setup-tokens`

```json
{
  "payment_source": {
    "paypal": {
      "description": "Mandate saved PayPal wallet",
      "permit_multiple_payment_tokens": false,
      "usage_pattern": "IMMEDIATE",
      "usage_type": "MERCHANT",
      "customer_type": "CONSUMER",
      "experience_context": {
        "shipping_preference": "NO_SHIPPING",
        "payment_method_preference": "IMMEDIATE_PAYMENT_REQUIRED",
        "brand_name": "Mandate",
        "locale": "en-US",
        "return_url": "https://example.com/api/paypal/link/return",
        "cancel_url": "https://example.com/mandates?linked=0"
      }
    }
  }
}
```

A successful setup returns `PAYER_ACTION_REQUIRED` and an `approve` link. `POST /api/paypal/link` returns that URL and nothing else. The return handler reads `approval_token_id`, then `approval_session_id`, then `token`. The guide's approve link uses `approval_session_id`. The return query name is not in the request sample, so the handler accepts the three names PayPal redirects have used.

`POST /v3/vault/payment-tokens`

```json
{
  "payment_source": {
    "token": {
      "id": "<setup-token-id>",
      "type": "SETUP_TOKEN"
    }
  }
}
```

The payment token id is the vault id. It is stored in `payment_methods.paypal_vault_id` and is not returned to the browser or written to the ledger. Ledger payloads store a 12-character SHA-256 fingerprint.

`POST /v2/checkout/orders` for a saved wallet. The guide's sample is a single amount. This app adds the same line items the policy engine uses, with USD amounts converted from integer cents. `vault_id` is the stored payment token id.

```json
{
  "intent": "CAPTURE",
  "purchase_units": [
    {
      "reference_id": "charge-vaulted",
      "description": "Mandate purchase",
      "amount": {
        "currency_code": "USD",
        "value": "5.00",
        "breakdown": {
          "item_total": { "currency_code": "USD", "value": "5.00" }
        }
      },
      "items": [
        {
          "name": "paypal.com",
          "description": "sandbox",
          "quantity": "1",
          "unit_amount": { "currency_code": "USD", "value": "5.00" },
          "category": "DIGITAL_GOODS"
        }
      ]
    }
  ],
  "payment_source": {
    "paypal": {
      "vault_id": "<payment-token-id>"
    }
  }
}
```

The guide's sample response status is `COMPLETED`, so a completed create is not captured a second time. Status `APPROVED` is captured with `POST /v2/checkout/orders/{id}/capture` and an empty body.

Per-order buyer approval, used when Vault is unavailable, is `POST /v2/checkout/orders`:

```json
{
  "intent": "CAPTURE",
  "payment_source": {
    "paypal": {
      "experience_context": {
        "brand_name": "Mandate",
        "locale": "en-US",
        "shipping_preference": "NO_SHIPPING",
        "user_action": "PAY_NOW",
        "return_url": "https://example.com/paypal/return",
        "cancel_url": "https://example.com/paypal/cancel"
      }
    }
  },
  "purchase_units": [
    {
      "reference_id": "<mandate-id>",
      "description": "Mandate purchase",
      "amount": {
        "currency_code": "USD",
        "value": "5.00",
        "breakdown": {
          "item_total": { "currency_code": "USD", "value": "5.00" }
        }
      },
      "items": [
        {
          "name": "<merchant>",
          "description": "<category>",
          "quantity": "1",
          "unit_amount": { "currency_code": "USD", "value": "5.00" },
          "category": "DIGITAL_GOODS"
        }
      ]
    }
  ]
}
```

The approve URL is `rel: "payer-action"`, then `rel: "approve"`. Capture is the same empty-body capture as the hello order.

```bash
npm run charge-vaulted -- 500
```

That charges the newest active saved wallet. It does not print the vault id.

Live sandbox check on 2026-10-10: `POST /v3/vault/setup-tokens` with the body above returned HTTP success, status `PAYER_ACTION_REQUIRED`, an `approve` link, and a customer id. PayPal did not reject the call for permissions or billing-agreement review. Buyer approval, the payment-token exchange, and `npm run charge-vaulted` were not run. Those need a sandbox personal account to open the approval URL.

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
- Category guide: https://docs.trychannel3.com/guides/category
- Category model: https://docs.trychannel3.com/api-reference/category-model
- Product detail: https://docs.trychannel3.com/api-reference/v1/product-detail
- Product detail guide: https://docs.trychannel3.com/guides/product-detail
- Make a search: https://docs.trychannel3.com/guides/make-a-search

Base URL is `https://api.trychannel3.com`. Search is `POST /v1/search` with header `x-api-key`. The app calls it through `@channel3/sdk` (`Channel3.products.search`; SDK guide: https://docs.trychannel3.com/sdk). The client asks for `config.currency=USD`, `country=US`, and `language=en`, and limits the page to 10 products. The key is read from `CHANNEL3_API_KEY`.

The OpenAPI `Product` requires `id` and `title`. Optional fields used here are `description`, `brands` (`id`, `name`), `category` (`slug`, `title`, `has_children`, and optional `path` of `{slug, title}` from the root), and `offers`. Category slugs are hyphenated path segments. Matching treats hyphens, underscores, and spaces as the same separator and accepts a hit on any segment of a hierarchical path.

The category taxonomy is `GET https://api.trychannel3.com/v1/categories` (https://docs.trychannel3.com/api-reference/v1/list-categories). A live page on 2026-10-10 reported `total` 11861. That list is too large to paste into the parser prompt. `GET https://api.trychannel3.com/v1/categories/search` (https://docs.trychannel3.com/api-reference/v1/search-categories) returns `CategorySummary` hits from the same taxonomy. The parser may only keep slugs from those hits; other model text is dropped. A search for “printer paper” returns the slug `printer-copier-paper` (path `office-supplies` / `general-office-supplies` / `paper-products` / `printer-copier-paper`). Confirming a mandate filters chips the same way. The form shows the remaining slugs as removable chips.

The OpenAPI `ProductOffer` requires `url`, `domain`, `price`, and `availability` (`InStock` or `OutOfStock`). `Price` requires `price` (number, current amount in major units) and `currency`. `compare_at_price` is optional. The offer guide's JSON example uses `price.amount` instead of `price.price`. The client follows the OpenAPI schema and rejects the `amount` shape.

What the docs show for the fields this app needs:

- Price and currency: yes, on the offer, as `price.price` and `price.currency`. Not on the product.
- Merchant name: no name field on the offer. The stable merchant value on the offer is `domain`. `brands[].name` is the product brand, not the retailer. Search filters accept website ids or domains, but the offer object does not return a website id.
- Stable product id: yes, `product.id`.
- Category: yes, optional `category.slug`, `category.title`, and `category.path`. The category can be null.
- Return policy: no field on the product or the offer. The commissions FAQ mentions a retailer return window for payouts, which is not a free-returns flag.
- Shipping or delivery estimate: no field. `dimensions` is physical size and weight, not a delivery date.

`src/lib/shopping` therefore sets `freeReturns` and `deliveryDate` to null, meaning unknown. A required rule with unknown catalog data escalates. Merchant allow and block lists compare normalized domains, and a listed domain also covers its subdomains. Prior spend is the sum of `paypal.order.captured` ledger amounts for the mandate. Gemini ranking returns only `productId`, `quantity`, and `reasoning`.

Product detail is `GET https://api.trychannel3.com/v1/products/{product_id}` with `x-api-key` and query `currency`, `country`, and `language` (the client asks for USD, US, and en). Prices are still on `offers`. `refetchPrice` in `src/lib/channel3/price.ts` reads the lowest in-stock USD offer. `guardedCheckout` copies that price onto each line as `checkoutUnitPriceCents` before the policy engine runs.

A checkout then reserves that payable total inside a Postgres transaction locked with `pg_advisory_xact_lock(hashtext(mandate_id)::bigint)`. The hold is a `checkout.reserved` ledger row. Open spend is captured `paypal.order.captured` amounts for that mandate, plus reservations that have not been released or captured. The captured row includes the mandate id and `amount.currencyCode` / `amount.value` taken from PayPal's capture response, which is what `spentCentsForMandate` sums. If PayPal's order amount or capture amount is not the approved cent total, checkout throws and writes `checkout.released` plus `paypal.order.failed`. A failed PayPal call releases the same hold. An `ESCALATE` verdict stores a pending approval (purchase snapshot, reasons, one-hour expiry) and does not create an order. `approveEscalation` re-fetches the price and runs the policy again. A `BLOCK` stops with no order. Any other verdict creates an Orders v2 buyer-approval order. `captureAfterApproval` checks the order amount against that snapshot before capture, then checks the capture amount. `npm run agent -- <mandateId>` shops with the mandate query and then runs that guarded checkout. `chargeVaulted` is only imported from `src/lib/checkout`. `npm run charge-vaulted` refuses to start when `NODE_ENV=production`.

```bash
npm run shop -- <mandateId>
```

The command uses the mandate's `searchQuery`. Add a query argument to override it.
