import { closeDb } from "../src/db/client";
import { readChannel3Env } from "../src/lib/channel3/env";
import { runGuardedCheckout } from "../src/lib/checkout/live";
import { createGeminiGenerate } from "../src/lib/gemini/client";
import { readGeminiEnv } from "../src/lib/gemini/env";
import { redactSecrets } from "../src/lib/gemini/redact";
import { getMandate } from "../src/lib/mandate/store";
import { shopQuery } from "../src/lib/shopping/query";
import { runShoppingSearch } from "../src/lib/shopping/run";

async function main() {
  const mandateId = process.argv[2];
  if (!mandateId) {
    throw new Error("Usage: npm run agent -- <mandateId>");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }
  readChannel3Env();
  const { apiKey, model } = readGeminiEnv();

  const mandate = await getMandate(mandateId);
  if (!mandate) {
    throw new Error("Mandate was not found.");
  }
  const query = shopQuery(mandate.searchQuery, "");
  if (!query) {
    throw new Error("The mandate has no search query.");
  }

  const shopped = await runShoppingSearch(mandate, query, {
    generate: createGeminiGenerate(apiKey),
    model,
  });
  const line = shopped.purchase.lineItems[0];
  if (!shopped.selection || !line) {
    console.log(JSON.stringify({ shopping: shopped.decision, selection: shopped.selection }, null, 2));
    return;
  }

  const checkout = await runGuardedCheckout(mandateId, {
    productId: shopped.selection.productId,
    quantity: shopped.selection.quantity,
    merchant: line.merchant,
    category: line.category,
    unitPriceCents: line.unitPriceCents,
    freeReturns: line.freeReturns,
    deliveryDate: line.deliveryDate,
  });
  console.log(JSON.stringify({ shopping: shopped.decision, checkout }, null, 2));
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Agent checkout failed.";
    console.error(redactSecrets(message));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
