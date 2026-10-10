import { execFileSync } from "node:child_process";

import { secretViolations } from "../src/lib/secrets/scan";

const listed = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACM", "-z"], {
  encoding: "utf8",
});
const files = listed.split("\0").filter((file) => file.length > 0);
const failures: string[] = [];

for (const file of files) {
  let content: string;
  try {
    content = execFileSync("git", ["show", `:${file}`], { encoding: "utf8" });
  } catch {
    continue;
  }
  if (content.includes("\0")) {
    continue;
  }
  const hits = secretViolations(content);
  if (hits.length > 0) {
    failures.push(`${file}: ${hits.join(", ")}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  console.error("Refusing to commit staged secrets.");
  process.exit(1);
}
