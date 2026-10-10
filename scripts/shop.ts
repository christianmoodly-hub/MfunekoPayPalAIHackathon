import { closeDb } from "../src/db/client";
import { readChannel3Env } from "../src/lib/channel3/env";
import { createGeminiGenerate } from "../src/lib/gemini/client";
import { readGeminiEnv } from "../src/lib/gemini/env";
import { redactSecrets } from "../src/lib/gemini/redact";
import { getMandate } from "../src/lib/mandate/store";
import { runShoppingSearch } from "../src/lib/shopping/run";
import { shopQuery } from "../src/lib/shopping/query";

async function main() {
  const [mandateId, ...queryParts] = process.argv.slice(2);
  if (!mandateId) {
    throw new Error('Usage: npm run shop -- <mandateId> ["<query>"]');
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
  const query = shopQuery(mandate.searchQuery, queryParts.join(" "));
  if (!query) {
    throw new Error('The mandate has no search query. Pass one: npm run shop -- <mandateId> "<query>"');
  }

  const result = await runShoppingSearch(mandate, query, {
    generate: createGeminiGenerate(apiKey),
    model,
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Shopping search failed.";
    console.error(redactSecrets(message));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
