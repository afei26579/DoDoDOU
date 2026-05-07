-- CreateTable
CREATE TABLE "GalleryAuthor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GalleryAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "size" INTEGER,
    "checksum" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GalleryPatternDetail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "beadCount" INTEGER NOT NULL,
    "paletteCount" INTEGER NOT NULL,
    "colorStatsJson" JSONB NOT NULL,
    "configJson" JSONB NOT NULL,
    "patternPayloadJson" JSONB NOT NULL,
    "sourceMetadataJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GalleryPatternDetail_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "GalleryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GalleryItem" (
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
    CONSTRAINT "GalleryItem_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "GalleryAuthor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GalleryPatternDetail_itemId_key" ON "GalleryPatternDetail"("itemId");

-- CreateIndex
CREATE INDEX "GalleryItem_publishedAt_idx" ON "GalleryItem"("publishedAt");

-- CreateIndex
CREATE INDEX "GalleryItem_sortWeight_idx" ON "GalleryItem"("sortWeight");

-- CreateIndex
CREATE INDEX "GalleryItem_hotScore_idx" ON "GalleryItem"("hotScore");
