-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UploadedFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "masterId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "lastReadOffset" INTEGER NOT NULL DEFAULT 0,
    "lastReadAt" DATETIME,
    "summary" TEXT NOT NULL DEFAULT '',
    "glossarySummary" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadedFile_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UploadedFile" ("createdAt", "filename", "id", "lastReadAt", "lastReadOffset", "masterId", "size", "text") SELECT "createdAt", "filename", "id", "lastReadAt", "lastReadOffset", "masterId", "size", "text" FROM "UploadedFile";
DROP TABLE "UploadedFile";
ALTER TABLE "new_UploadedFile" RENAME TO "UploadedFile";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
