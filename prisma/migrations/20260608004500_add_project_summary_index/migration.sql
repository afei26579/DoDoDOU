CREATE INDEX "WorkshopProject_summary_idx" ON "WorkshopProject"(
  "userId",
  "updatedAt",
  "id",
  "clientProjectId",
  "title",
  "status",
  "sourceType",
  "sourceItemId",
  "coverUrl",
  "previewUrl",
  "width",
  "height",
  "beadCount",
  "paletteCount",
  "lastOpenedAt",
  "createdAt"
);
