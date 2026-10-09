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

`PAYPAL_ENV` must be `sandbox`. Ledger rows use a null `mandate_id` and one of: `paypal.order.created`, `paypal.order.confirmed`, `paypal.order.payer_action_required`, `paypal.order.captured`, `paypal.order.failed`.
