import { describe, expect, it } from "vitest";

import { operatorChargeVaulted } from "../src/lib/checkout/operator";

describe("operatorChargeVaulted", () => {
  it("refuses to run when NODE_ENV is production", async () => {
    await expect(operatorChargeVaulted(100, { NODE_ENV: "production" })).rejects.toThrow(
      /cannot run when NODE_ENV=production/,
    );
  });
});
