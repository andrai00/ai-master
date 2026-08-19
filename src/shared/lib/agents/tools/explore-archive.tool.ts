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

    // Flat list of every folder path with its direct file count and samples.
    // This is the source of truth for nesting — the model must decide a type
    // for EACH folder, and deeper folders override their parent.
    const folderMap = new Map<string, { fileCount: number; samples: string[] }>();

    for (const f of files) {
      const dir = f.path || "/";

      if (!folderMap.has(dir)) {
        folderMap.set(dir, { fileCount: 0, samples: [] });
      }
      const entry = folderMap.get(dir)!;
      entry.fileCount++;
      if (entry.samples.length < 5) entry.samples.push(f.filename);
    }

    // Hierarchical tree (subfolders per node) for visual structure.
    const tree: ITreeNode[] = [];
    for (const [path, data] of folderMap) {
      const subdirs = new Set<string>();
      for (const [otherPath] of folderMap) {
        if (otherPath.startsWith(path + "/")) {
          const rest = otherPath.slice(path.length + 1).split("/")[0];
          if (rest) subdirs.add(`${path}/${rest}`);
        }
      }
      tree.push({
        path,
        files: data.fileCount,
        folders: [...subdirs].sort(),
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
