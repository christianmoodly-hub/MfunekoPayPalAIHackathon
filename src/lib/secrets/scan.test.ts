import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { secretViolations } from "./scan";

const SKIP_DIRECTORIES = new Set(["node_modules", ".next", ".git", "coverage", "out"]);
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".md", ".json", ".sql", ".example", ".yml", ".yaml", ".css"]);

describe("secretViolations", () => {
  it("flags postgres credentials, AIza keys, and password lines", () => {
    const sampleKey = ["AI", "zaSyExampleSecretKey12"].join("");
    const credentialUrl = ["postgres://user", "password@localhost:5432/mandate"].join(":");
    const passwordLine = ["pass", "word=hunter2"].join("");
    const passwordBlock = ["Pass", "word\nsecret-value"].join("");
    expect(secretViolations("postgres://localhost:5432/mandate")).toEqual([]);
    expect(secretViolations(credentialUrl)).toEqual(["postgres URL with a password"]);
    expect(secretViolations(`key ${sampleKey}`)).toEqual(["AIza API key"]);
    expect(secretViolations(passwordLine)).toEqual(["password line"]);
    expect(secretViolations(passwordBlock)).toEqual(["password line"]);
    expect(secretViolations("PAYPAL_CLIENT_SECRET=")).toEqual([]);
  });

  it("finds no secrets in the repository text", () => {
    const root = process.cwd();
    const failures: string[] = [];
    for (const file of walk(root)) {
      const content = readFileSync(file, "utf8");
      const hits = secretViolations(content);
      if (hits.length > 0) {
        failures.push(`${path.relative(root, file)}: ${hits.join(", ")}`);
      }
    }

    expect(failures).toEqual([]);
  });
});

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(entry)) {
      continue;
    }
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (TEXT_EXTENSIONS.has(path.extname(entry))) {
      files.push(fullPath);
    }
  }
  return files;
}
