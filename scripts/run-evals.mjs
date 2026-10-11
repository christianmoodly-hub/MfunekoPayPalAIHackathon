import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const live = args.includes("--live");
const unsupported = args.filter((arg) => arg !== "--live");
if (unsupported.length > 0) {
  process.stderr.write("Unsupported eval option: " + unsupported.join(" ") + "\n");
  process.exit(2);
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const result = spawnSync(
  process.execPath,
  [vitest, "run", "--config", "evals/vitest.config.mts"],
  {
    cwd: root,
    env: { ...process.env, MANDATE_EVALS_LIVE: live ? "1" : "0" },
    stdio: "inherit",
  },
);

if (result.error) {
  process.stderr.write(result.error.message + "\n");
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
