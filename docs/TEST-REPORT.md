# Test report

Ran locally on 10 Oct 2026 against `http://localhost:3000`. Each case used a new mandate. Wallet fingerprint `a5fa85ae4886` was already linked. The dev server was started with `APP_URL=http://localhost:3000` and a temporary `DEMO_PASSCODE` of `mandate-test-plan`, because those two variables are not in `.env`.

## What still needs you

- **PayPal sandbox dashboard.** Transaction Search returned “Authorization failed due to insufficient permissions.” Order lookups matched the ledger (below), but I never opened the dashboard UI.
- **Private window.** A request with no cookie redirects to `/enter` and `/api/ledger` returns 401. I could not open a separate private browser window.
- **Do not pay order `7G795977G0985823R`.** That is the cancelled abandon checkout. The app released the hold, but PayPal still reports `PAYER_ACTION_REQUIRED`.
- **Recording resolution.** I used a 390px-wide phone frame and 1920×1080. I do not know the resolution you record at.

## Results

### Approve

The sentence “Buy printer paper under $20.” does not approve on its own. Parse set the budget to $20 and **Escalate above** to $10 (half the cap). The run picked Staples multipurpose paper at $10.19 and escalated: “Cart total of 1019 cents exceeds the escalate threshold of 1000 cents.” Ledger for that mandate has `checkout.escalated` and no PayPal order. Mandate `25d7a5a7-c608-46b7-875c-fe8b7e251725`, run `38100301-6ec4-4512-8217-12435dc33851`.

A second mandate with the same sentence, and Escalate above raised to $20 before confirm, did pay from the saved wallet.

- Mandate `4e583576-7512-405e-860f-263175a64080`, run `658cf20b-c58c-47a4-bb42-1ac5c01dec2f`
- Walmart Bond paper, $6.27
- Order `64J01042RH536261W`, status `COMPLETED`
- Ledger order: `checkout.reserved` at 14:25:45Z, then `paypal.order.captured` at 14:25:53Z
- Meter: $0.00 spent → $6.27 spent, $13.73 left of $20.00
- Run banner: “Approved. Captured USD $6.27 in the PayPal sandbox.”

### Escalate

“Buy printer paper under $20. Must have free returns.” Escalate above was set to $20 so the price would not also escalate. The run picked the same $6.27 Walmart paper with `freeReturns: null` and escalated only because free returns could not be verified. The model’s reasoning claimed the merchants offer free returns. The policy ignored that text.

- Mandate `8baf7e3e-c3aa-4288-b058-ed8752505672`, run `6fe6d80f-520e-4e94-8204-f3bb0c097248`
- Approval `88e965d0-9032-43b8-bb07-b332cfc28c7e`
- In-app “Approve via PayPal” reserved $6.27 (spent $0, held $6.27, $13.73 left) and created order `5KG88089KD281534E` (`PAYER_ACTION_REQUIRED`)
- PayPal’s checkout then captured it. Ledger has one `paypal.order.captured` for USD 6.27. Approval status is `captured`. Balance is spent $6.27, held $0.00
- The approval page says “This purchase was captured.”
- The run page still says “Escalated. A person has to approve before capture.” The capture is not on the run record
- Going back to that PayPal checkout URL afterwards showed “Things don’t appear to be working at the moment.”

### Abandon

Started from the first escalated Staples approval (`4372f5c7-456c-43df-a1c8-8ae729f3c11e`), approved it in the app, then chose “Cancel and return to Mandate” on PayPal’s page. The sandbox session was already signed in.

- Order `7G795977G0985823R`, $10.19
- Before cancel: spent $0, held $10.19, $9.81 left
- After cancel: `checkout.released`, then `approval.cancelled`. Spent $0, held $0, $20.00 left. No capture
- The run page still says a person has to approve
- PayPal still reports `PAYER_ACTION_REQUIRED` for that order. The cancel route releases the local hold and does not void the PayPal order

### Block

Cap set to $5.00 and `staples.com` blocked, on “Buy printer paper under $20.” The agent picked Walmart at $6.27, so the merchant block never fired. The cap did.

- Mandate `41345fe9-e129-4911-84d7-f6639f710b0a`, run `d719c9a8-df7f-4813-9aed-8367d24f3d08`
- Run page, in dollars: total and unit price “USD $6.27 of USD $5.00”
- Ledger type is only `checkout.blocked`. No `paypal.*` event
- Dashboard check of the PayPal sandbox was not possible from here

### Budget runs out

Cap $12.00, escalate threshold $12.00, same paper search.

- Mandate `21955aac-48c5-461f-8cba-e3dc7bcc8578`
- First run `73f2b2e0-b25d-41df-be3a-650ab8eeaa9e` approved and captured $6.27, order `3TK33008SA693101S`. Left $5.73
- Second run `606b3995-b874-4ab9-a195-aa0cbc4e7ff8` blocked: “Cart total of 627 cents plus prior spend of 627 cents exceeds the mandate cap of 1200 cents.”
- Balance stayed spent $6.27, held $0, left $5.73. One capture only

### Replay

Refreshing `GET /api/paypal/order/return?token=5KG88089KD281534E` after the escalation capture redirected to run `6fe6d80f-520e-4e94-8204-f3bb0c097248`. The captured row count stayed 1 (same event id) and spend stayed $6.27.

Refreshing the vault order `64J01042RH536261W` on that same return route redirected to `/mandates?checkout=missing`, because a vault charge has no approval row. It also did not write a second capture.

Older ledger row, from before this session: order `2PW24190WB031924R` has two `paypal.order.captured` events for one $5.00 capture. The meter counts that order once.

### Vague mandate

“something nice for my sister” parsed to a $0.00 budget. The form says “This mandate still needs input” and “Missing: budget.” Confirm stays disabled. The search query was set to the whole sentence. The yellow warning sits under the sticky confirm bar, so it is easy to miss.

### Auth

- `GET /` with no cookie: `307` to `/enter?next=%2F`, and the passcode page rendered
- `GET /api/ledger` with no cookie: `401` `{"error":"Sign in required."}`

### Reconcile

Orders API captures, compared with ledger rows deduped by order id:

| Order | PayPal | Ledger |
| --- | --- | --- |
| `64J01042RH536261W` | USD 6.27 COMPLETED | one capture |
| `3TK33008SA693101S` | USD 6.27 COMPLETED | one capture |
| `5KG88089KD281534E` | USD 6.27 COMPLETED | one capture |
| `0EW94499FD8874619` | USD 9.99 COMPLETED | one capture (older) |
| `9WF30203D4848041U` | USD 9.99 COMPLETED | one capture (older) |
| `2PW24190WB031924R` | USD 5.00 COMPLETED | two capture events, one order (older) |
| `1K940248U76722638` | USD 5.00 COMPLETED | one capture (older) |
| `7G795977G0985823R` | PAYER_ACTION_REQUIRED, no capture | no capture |

Deduped total is **USD $48.79**, which matches the ledger page. The dashboard meter shows **USD $38.79** because it only sums captures that belong to a mandate, and the two $5.00 hello orders have no mandate id.

The ledger page also shows **USD $6.00** still held. That reservation (`ba296494-8040-475c-b9f2-df69db2f840e`, mandate `6c6d6aa7-f203-4298-8716-549763049b33`, 10:48 UTC) was already there. The dashboard escrow meter showed $0.00. Those two meters do not agree.

## Polish

Each of these is a UI fix, not a policy failure.

- A mandate that only says “under $20” escalates above $10. The approve path needs the threshold raised by hand, and nothing on the form explains that the threshold defaulted to half the cap.
- Block and budget reasons in the run outcome and on the approval card are written in cents (“1019 cents”, “627 cents”). The run page’s “Rules checked” cards are in dollars and are clear.
- After a PayPal return capture, and after a PayPal cancel, the run page keeps the original “Escalated. A person has to approve before capture.” banner. The approval page is the only place that says the purchase was captured.
- The approval card’s button stays labeled “Approve via PayPal” after capture. It is disabled, and a separate line says the purchase was captured.
- Product reasoning quotes Channel3 ids (`uc7VEuG`, `3n5xkgy`) and, on the free-returns run, claimed free returns that the catalog did not mark.
- Category lines show the full Channel3 path (`office-supplies/general-office-supplies/...`) instead of the short slug.
- The dashboard list takes about 25 seconds, and with more mandates it took about a minute. The page sits on “Checking the PayPal sandbox vault…” and “Loading mandates” the whole time.
- “Missing: budget.” is hidden behind the sticky confirm bar.
- On a phone-width layout the Mandates / Ledger / Wallet links are not in the header (`hidden` until the `md` breakpoint). The sandbox pill and wallet state are hidden too. Status tabs clip (“Expired (C”). The ledger event column clips `paypal.order.captured`. The sticky header covers the first table row and the product title when you scroll.
- The ledger is a long run of `shopping.candidate` rows, so the money events are hard to see.
- Decorative copy reads like real controls or certifications: `us-east-1 // sim`, `POLICY_GOV_SPEC_v2.08`, `SEC-L2 Enforced`, `ZERO OVERDRAFT RISK`, `Escrow holds`.
- `toLocaleString()` on the approval expiry hydrates differently on the server and the client. In `next dev` that opens the Next.js issue overlay on the approval page (`approval-screen.tsx` `formatTime`).
- Dashboard captured ($38.79) and ledger captured ($48.79) are both labeled as settled spend and do not match.
