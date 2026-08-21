import { describe, it, expect, vi, beforeEach } from "vitest";

const countMock = vi.fn();
const deleteManyMock = vi.fn();

vi.mock("@/src/shared/lib/db/prisma", () => ({
  getPrisma: () => ({ document: { count: countMock, deleteMany: deleteManyMock } }),
}));
vi.mock("@/src/shared/lib/db/active-game", () => ({
  getActiveGame: async () => ({ currentMasterId: "m1" }),
}));
vi.mock("@/src/shared/lib/db/game-mode-guard", () => ({ assertNotGameMode: async () => {} }));
vi.mock("@/src/shared/lib/events/game-events", () => ({ broadcastGameEvent: () => {} }));
vi.mock("@/src/shared/lib/agents/parse-cancel", () => ({ isCancelled: () => false }));

import { deleteDocumentsByTypeTool } from "./delete-documents-by-type.tool";

beforeEach(() => {
  countMock.mockReset();
  deleteManyMock.mockReset();
});

describe("deleteDocumentsByTypeTool", () => {
  it("dry run without confirm does NOT delete", async () => {
    countMock.mockResolvedValue(323);
    const out = await deleteDocumentsByTypeTool.execute({ type: "article" });
    expect(out).toMatchObject({ wouldDelete: 323, confirmRequired: true });
    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  it("deletes only when confirm is true", async () => {
    countMock.mockResolvedValue(323);
    deleteManyMock.mockResolvedValue({ count: 323 });
    const out = await deleteDocumentsByTypeTool.execute({ type: "article", confirm: true });
    expect(out).toEqual({ deleted: 323, type: "article" });
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { masterId: "m1", category: "glossary", type: "article" },
    });
  });
});
