import { it } from "vitest";

import { runEvals } from "./run";

it("runs the adversarial evaluation suite", async () => {
  await runEvals();
}, 120_000);
