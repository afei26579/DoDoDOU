-- CreateTable
CREATE TABLE "WorkshopProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clientProjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'editing',
    "sourceType" TEXT NOT NULL,
    "sourceItemId" TEXT,
    "coverUrl" TEXT,
    "previewUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "beadCount" INTEGER,
    "paletteCount" INTEGER,
    "payloadJson" JSONB NOT NULL,
    "lastOpenedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkshopProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WorkshopProject_userId_updatedAt_idx" ON "WorkshopProject"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopProject_userId_clientProjectId_key" ON "WorkshopProject"("userId", "clientProjectId");
