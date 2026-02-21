-- CreateTable
CREATE TABLE "UpsellProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "UpsellProduct_shop_idx" ON "UpsellProduct"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "UpsellProduct_shop_productId_key" ON "UpsellProduct"("shop", "productId");
