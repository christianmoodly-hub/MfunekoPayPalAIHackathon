# Five-minute judge walkthrough

The hosted URL is linked in the README. Get the demo passcode and sandbox buyer credentials from the **Devpost testing instructions**. Credentials are deliberately not stored in the repository.

## 0:00–1:00 — Open the dashboard

1. Open the hosted demo and enter the Devpost passcode.
2. On a free Render instance, the first page load can take about a minute while the service wakes up. Wait for the dashboard and mandate list to finish loading.
3. If fewer than three mandates exist, use the **Try it in 3 steps** panel. Pick an example, review the prefilled instruction, parse it, inspect the structured fields, then confirm the mandate. The labels describe usual outcomes: prices can change the cap result; unknown required returns data escalates.
4. If a PayPal sandbox wallet is not linked, link it from the dashboard before trying a capture. Approve the vault setup with the sandbox personal buyer account from Devpost.

## 1:00–2:15 — Approve

1. Use **Approve example**: “Buy printer paper for up to $20. Only ask me before spending more than $15.”
2. Parse and review the rules. Confirm, then start a run.
3. Expect the policy to approve if the selected live offer remains under the $15 escalation threshold and $20 cap, and the mandate has available budget. Current catalog prices can change this result.
4. If checkout uses PayPal's buyer-approval page, sign in there with the sandbox personal buyer account in the Devpost testing instructions, approve the sandbox purchase, and return to the app. The run page should show approved and captured after confirmation.

## 2:15–3:15 — Escalate

1. Use **Escalate example**: “Buy printer paper for up to $20. It must have free returns.”
2. Confirm and run it. Channel3 does not provide a verified free-returns field, so the policy should escalate instead of treating the model or product text as proof.
3. Open the approval page. Review the cart and reasons, then approve. If PayPal opens, finish buyer approval with the same sandbox personal account. Checkout re-fetches the price and re-runs policy; a new BLOCK cannot be overridden by human approval.

## 3:15–4:15 — Block

1. Use **Block example**: “Buy printer paper, spend no more than $2.”
2. Confirm and run it. Printer-paper offers are usually above $2, so expect BLOCK before any PayPal order is created. This outcome depends on current catalog prices.

## 4:15–5:00 — Audit and explain the boundary

1. Open **Ledger** and filter/search the new events. Show the shopping proposal, deterministic verdict, reservation/order/capture events, or the blocked event.
2. Explain the trust boundary: Gemini proposes; server policy decides. Unknown returns/delivery data escalates, structured seller and current checkout price are checked, and unlinked test charges do not count as mandate spend.
3. Point judges to the offline eval table and mutation-check record in the README. The live Gemini evals are opt-in and are not part of the default CI run.

All purchases shown are sandbox simulations. Nothing is ordered from a retailer or fulfilled.
