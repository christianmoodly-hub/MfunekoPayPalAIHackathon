import { describe, expect, it } from "vitest";

import { paypalRequestId } from "./request-id";

describe("paypalRequestId", () => {
  it("derives a stable id from the caller key", () => {
    expect(paypalRequestId("hello-order:create")).toBe(paypalRequestId("hello-order:create"));
    expect(paypalRequestId(" hello-order:create ")).toBe(paypalRequestId("hello-order:create"));
  });

  it("derives different ids for different keys", () => {
    expect(paypalRequestId("hello-order:create")).not.toBe(paypalRequestId("hello-order:capture:ORDER"));
  });

  it("rejects an empty key", () => {
    expect(() => paypalRequestId("  ")).toThrow(/request key is required/);
  });
});
