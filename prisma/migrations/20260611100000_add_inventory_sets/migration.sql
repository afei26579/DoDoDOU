-- CreateTable
CREATE TABLE "BeadInventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'custom',
    "baseBrand" TEXT NOT NULL DEFAULT 'MARD',
    "sourcePaletteId" TEXT,
    "sourcePaletteName" TEXT,
    "sourcePaletteType" TEXT,
    "colorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BeadInventory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Seed one default inventory for every user that already has inventory items.
INSERT INTO "BeadInventory" (
    "id",
    "userId",
    "name",
    "mode",
    "baseBrand",
    "colorCount",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy-' || "userId",
    "userId",
    '我的库存',
    'custom',
    COALESCE(MIN("brandKey"), 'MARD'),
    COUNT(*),
    COALESCE(MIN("createdAt"), CURRENT_TIMESTAMP),
    COALESCE(MAX("updatedAt"), CURRENT_TIMESTAMP)
FROM "BeadInventoryItem"
GROUP BY "userId";

-- RedefineTable
CREATE TABLE "new_BeadInventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
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
    CONSTRAINT "BeadInventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BeadInventoryItem_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "BeadInventory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_BeadInventoryItem" (
    "id",
    "userId",
    "inventoryId",
    "brandKey",
    "code",
    "hex",
    "quantity",
    "lowStockThreshold",
    "location",
    "favorite",
    "note",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "userId",
    'legacy-' || "userId",
    "brandKey",
    "code",
    "hex",
    "quantity",
    "lowStockThreshold",
    "location",
    "favorite",
    "note",
    "createdAt",
    "updatedAt"
FROM "BeadInventoryItem";

DROP TABLE "BeadInventoryItem";
ALTER TABLE "new_BeadInventoryItem" RENAME TO "BeadInventoryItem";

-- CreateIndex
CREATE INDEX "BeadInventory_userId_updatedAt_idx" ON "BeadInventory"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "BeadInventoryItem_userId_idx" ON "BeadInventoryItem"("userId");

-- CreateIndex
CREATE INDEX "BeadInventoryItem_inventoryId_idx" ON "BeadInventoryItem"("inventoryId");

-- CreateIndex
CREATE UNIQUE INDEX "BeadInventoryItem_inventoryId_brandKey_code_key" ON "BeadInventoryItem"("inventoryId", "brandKey", "code");
