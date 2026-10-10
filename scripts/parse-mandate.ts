import { closeDb } from "../src/db/client";
import { createGeminiGenerate } from "../src/lib/gemini/client";
import { readGeminiEnv } from "../src/lib/gemini/env";
import { redactSecrets } from "../src/lib/gemini/redact";
import { createMandateFromText } from "../src/lib/mandate/service";

async function main() {
  const text = process.argv.slice(2).join(" ").trim();
  if (!text) {
    throw new Error('Usage: npm run parse-mandate -- "buy office supplies under 50 dollars"');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Apply the migration with npm run db:migrate first.");
  }

  const { apiKey, model } = readGeminiEnv();
  const mandate = await createMandateFromText(text, {
    generate: createGeminiGenerate(apiKey),
    model,
  });
  console.log(JSON.stringify(mandate, null, 2));
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Could not parse the mandate.";
    console.error(redactSecrets(message));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
