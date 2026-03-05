import { describe, expect, it } from "vitest";

import { parsePollInterval, runWorkerTick } from "./index.js";

describe("parsePollInterval", () => {
  it("returns default interval when unset", () => {
    expect(parsePollInterval(undefined)).toBe(5000);
  });

  it("parses a valid integer interval", () => {
    expect(parsePollInterval("2500")).toBe(2500);
  });

  it("throws for invalid values", () => {
    expect(() => parsePollInterval("0")).toThrow("positive integer");
  });
});

describe("runWorkerTick", () => {
  it("formats a heartbeat message", () => {
    expect(runWorkerTick(new Date("2026-01-01T00:00:00.000Z"))).toBe(
      "[worker] heartbeat 2026-01-01T00:00:00.000Z"
    );
  });
});
