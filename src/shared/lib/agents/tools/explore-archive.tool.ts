import { z } from "zod";
import { zodSchema } from "ai";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { TOOL_DESCRIPTIONS } from "@/src/shared/config/prompts/tool-descriptions";

interface ITreeNode {
  path: string;
  files: number;
  folders: string[];
  samples: string[];
}

export const exploreArchiveTool = {
  description: TOOL_DESCRIPTIONS.explore_archive,
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    if (isCancelled()) throw new Error("errors.cancelled");

    const activeGame = await getActiveGame();
    const masterId = activeGame?.currentMasterId;
    if (!masterId) throw new Error("errors.noActiveGameTool");

    const prisma = getPrisma();
    const files = await prisma.uploadedFile.findMany({
      where: { masterId },
      select: { filename: true, path: true },
      orderBy: [{ path: "asc" }, { filename: "asc" }],
    });

    // Folder stats + subfolder links built in ONE pass (linear, like the
    // pre-19.08 version). Never loop over all folders inside another folder
    // loop: with thousands of files that is O(n^2) and freezes the event loop.
    const folderMap = new Map<string, { fileCount: number; samples: string[]; subdirs: Set<string> }>();

    for (const f of files) {
      const dir = f.path || "/";

      if (!folderMap.has(dir)) {
        folderMap.set(dir, { fileCount: 0, samples: [], subdirs: new Set() });
      }
      const entry = folderMap.get(dir)!;
      entry.fileCount++;
      if (entry.samples.length < 5) entry.samples.push(f.filename);

      const parts = dir.split("/").filter(Boolean);
      for (let i = 0; i < parts.length; i++) {
        const parentPath = "/" + parts.slice(0, i).join("/");
        if (!folderMap.has(parentPath)) {
          folderMap.set(parentPath, { fileCount: 0, samples: [], subdirs: new Set() });
        }
        const nextDir = parts.slice(0, i + 1).join("/");
        folderMap.get(parentPath)!.subdirs.add(nextDir);
      }
    }

    // Hierarchical tree (subfolders per node) for visual structure.
    const tree: ITreeNode[] = [];
    for (const [path, data] of folderMap) {
      tree.push({
        path,
        files: data.fileCount,
        folders: [...data.subdirs].sort(),
        samples: data.samples,
      });
    }
    tree.sort((a, b) => a.path.localeCompare(b.path));

    // Flat folder list — one line per folder, full path + direct file count,
    // so the model never has to reconstruct nesting from the tree.
    const folders = [...folderMap.entries()]
      .map(([path, data]) => ({
        path,
        files: data.fileCount,
        samples: data.samples,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

    return {
      totalFiles: files.length,
      tree,
      folders,
    };
  },
};
