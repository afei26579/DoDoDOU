-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OAuthAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GalleryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'community',
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "status" TEXT NOT NULL DEFAULT 'published',
    "authorId" TEXT NOT NULL,
    "coverAssetId" TEXT NOT NULL,
    "previewAssetId" TEXT NOT NULL,
    "sourceAssetId" TEXT,
    "exportAssetId" TEXT,
    "style" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "canvasSize" INTEGER NOT NULL,
    "tagsJson" JSONB NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "favoriteCount" INTEGER NOT NULL DEFAULT 0,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "hotScore" INTEGER NOT NULL DEFAULT 0,
    "coverWidth" INTEGER,
    "coverHeight" INTEGER,
    "sortWeight" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "publishedAt" DATETIME,
    CONSTRAINT "GalleryItem_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "GalleryAuthor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GalleryItem_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "GalleryAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GalleryItem_previewAssetId_fkey" FOREIGN KEY ("previewAssetId") REFERENCES "GalleryAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GalleryItem_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "GalleryAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GalleryItem_exportAssetId_fkey" FOREIGN KEY ("exportAssetId") REFERENCES "GalleryAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GalleryItem" ("authorId", "brand", "canvasSize", "coverAssetId", "coverHeight", "coverWidth", "createdAt", "description", "downloadCount", "exportAssetId", "favoriteCount", "hotScore", "id", "likeCount", "previewAssetId", "publishedAt", "shareCount", "sortWeight", "sourceAssetId", "sourceType", "status", "style", "tagsJson", "title", "updatedAt", "viewCount", "visibility") SELECT "authorId", "brand", "canvasSize", "coverAssetId", "coverHeight", "coverWidth", "createdAt", "description", "downloadCount", "exportAssetId", "favoriteCount", "hotScore", "id", "likeCount", "previewAssetId", "publishedAt", "shareCount", "sortWeight", "sourceAssetId", "sourceType", "status", "style", "tagsJson", "title", "updatedAt", "viewCount", "visibility" FROM "GalleryItem";
DROP TABLE "GalleryItem";
ALTER TABLE "new_GalleryItem" RENAME TO "GalleryItem";
CREATE UNIQUE INDEX "GalleryItem_coverAssetId_key" ON "GalleryItem"("coverAssetId");
CREATE UNIQUE INDEX "GalleryItem_previewAssetId_key" ON "GalleryItem"("previewAssetId");
CREATE UNIQUE INDEX "GalleryItem_sourceAssetId_key" ON "GalleryItem"("sourceAssetId");
CREATE UNIQUE INDEX "GalleryItem_exportAssetId_key" ON "GalleryItem"("exportAssetId");
CREATE INDEX "GalleryItem_publishedAt_idx" ON "GalleryItem"("publishedAt");
CREATE INDEX "GalleryItem_sortWeight_idx" ON "GalleryItem"("sortWeight");
CREATE INDEX "GalleryItem_hotScore_idx" ON "GalleryItem"("hotScore");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_providerAccountId_key" ON "OAuthAccount"("provider", "providerAccountId");
