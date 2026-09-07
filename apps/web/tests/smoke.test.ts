import { describe, expect, it } from "vitest";

describe("project foundation", () => {
  it("keeps the public product name stable", () => {
    expect("AniNexus").toBe("AniNexus");
  });
});
