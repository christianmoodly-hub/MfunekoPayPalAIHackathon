import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx|mts|js|mjs)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

describe("chargeVaulted imports", () => {
  it("is imported only from src/lib/checkout", () => {
    const root = process.cwd();
    const offenders: string[] = [];
    for (const file of [...sourceFiles(path.join(root, "src")), ...sourceFiles(path.join(root, "scripts"))]) {
      const normalized = file.split(path.sep).join("/");
      if (normalized.includes("/src/lib/checkout/")) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      if (/import\s*\{[^}]*\bchargeVaulted\b/.test(source)) {
        offenders.push(normalized.slice(root.length + 1));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("imports operatorChargeVaulted only from scripts", () => {
    const root = process.cwd();
    const offenders: string[] = [];
    for (const file of [...sourceFiles(path.join(root, "src")), ...sourceFiles(path.join(root, "scripts"))]) {
      const normalized = file.split(path.sep).join("/");
      if (normalized.includes("/scripts/")) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      if (/import\s*\{[^}]*\boperatorChargeVaulted\b/.test(source)) {
        offenders.push(normalized.slice(normalized.indexOf("src/")));
      }
    }

    expect(offenders).toEqual([]);
  });
});
