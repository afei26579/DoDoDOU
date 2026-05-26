-- CreateTable
CREATE TABLE "GalleryFavorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GalleryFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GalleryFavorite_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "GalleryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GalleryAuthor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GalleryAuthor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GalleryAuthor" ("avatarUrl", "createdAt", "id", "name", "updatedAt") SELECT "avatarUrl", "createdAt", "id", "name", "updatedAt" FROM "GalleryAuthor";
DROP TABLE "GalleryAuthor";
ALTER TABLE "new_GalleryAuthor" RENAME TO "GalleryAuthor";
CREATE UNIQUE INDEX "GalleryAuthor_userId_key" ON "GalleryAuthor"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GalleryFavorite_userId_createdAt_idx" ON "GalleryFavorite"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GalleryFavorite_itemId_idx" ON "GalleryFavorite"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryFavorite_userId_itemId_key" ON "GalleryFavorite"("userId", "itemId");
