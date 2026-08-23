import { describe, it, expect } from "vitest";
import { clearActions, isPlanDone, isReviewDone, markPlanDone, markReviewDone } from "./reply-tools";

describe("reply-tools plan/review flags", () => {
  it("tracks plan and review state per session", () => {
    clearActions("s1");
    expect(isPlanDone("s1")).toBe(false);
    expect(isReviewDone("s1")).toBe(false);
    markPlanDone("s1");
    expect(isPlanDone("s1")).toBe(true);
    markReviewDone("s1");
    expect(isReviewDone("s1")).toBe(true);
    clearActions("s1");
    expect(isPlanDone("s1")).toBe(false);
    expect(isReviewDone("s1")).toBe(false);
  });
});
