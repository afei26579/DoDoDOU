CREATE INDEX "GalleryItem_visibility_status_sortWeight_publishedAt_idx" ON "GalleryItem"("visibility", "status", "sortWeight", "publishedAt");
CREATE INDEX "GalleryItem_visibility_status_publishedAt_idx" ON "GalleryItem"("visibility", "status", "publishedAt");
CREATE INDEX "GalleryItem_visibility_status_hotScore_favoriteCount_publishedAt_idx" ON "GalleryItem"("visibility", "status", "hotScore", "favoriteCount", "publishedAt");
