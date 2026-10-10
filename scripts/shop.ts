import { closeDb } from "../src/db/client";
import { readChannel3Env } from "../src/lib/channel3/env";
import { createGeminiGenerate } from "../src/lib/gemini/client";
import { readGeminiEnv } from "../src/lib/gemini/env";
import { redactSecrets } from "../src/lib/gemini/redact";
import { getMandate } from "../src/lib/mandate/store";
import { runShoppingSearch } from "../src/lib/shopping/run";

async function main() {
  const [mandateId, ...queryParts] = process.argv.slice(2);
  const query = queryParts.join(" ").trim();
  if (!mandateId || !query) {
    throw new Error('Usage: npm run shop -- <mandateId> "<query>"');
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
