import { closeDb } from "../src/db/client";
import { operatorChargeVaulted } from "../src/lib/checkout/operator";

async function main() {
  const cents = readCents(process.argv.slice(2));
  await operatorChargeVaulted(cents);
}

function readCents(args: string[]): number {
  const raw = args[0];
  if (!raw || !/^[1-9]\d*$/.test(raw)) {
    throw new Error("Usage: npm run charge-vaulted -- <cents>");
  }
  const cents = Number(raw);
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Usage: npm run charge-vaulted -- <cents>");
  }
  return cents;
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Vault charge failed.";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
