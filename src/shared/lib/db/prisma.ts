import "server-only";

import { PrismaClient } from "@/src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

const globalPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let devPrisma: PrismaClient | undefined;

function createPrismaClient(): PrismaClient {
  const dbPath = path.join(process.cwd(), "data", "ai-master.db");
  const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  if (process.env.NODE_ENV === "production") {
    if (!globalPrisma.prisma) globalPrisma.prisma = createPrismaClient();
    return globalPrisma.prisma;
  }
  if (!devPrisma) devPrisma = createPrismaClient();
  return devPrisma;
}
