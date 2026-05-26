-- CreateTable
CREATE TABLE "BeadInventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "brandKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "hex" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lowStockThreshold" INTEGER,
    "location" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BeadInventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BeadInventoryItem_userId_idx" ON "BeadInventoryItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BeadInventoryItem_userId_brandKey_code_key" ON "BeadInventoryItem"("userId", "brandKey", "code");
