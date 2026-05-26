# Dodoudou 数据库表结构说明

本文档基于当前代码和本机 `dev.db` 实际结构整理，没有引用已过时的 `README.md`。

项目现在有两类数据存储：

- 浏览器数据库：前端使用 IndexedDB 和 localStorage 保存用户本机数据，例如工作台项目、编辑草稿、珠子库存和本机收藏状态。
- SQLite 数据库：后端画册 API 使用 SQLite 保存官方/社区图纸、图纸资源、作者和图纸明细。

静态 JSON 画册兜底数据已不再作为数据源使用。画册列表和详情应以后端 SQLite 返回的数据为准。

## 1. 浏览器数据库

浏览器数据库按域名隔离，数据只存在用户当前浏览器里，不会自动同步到后端。

### 1.1 IndexedDB: `dodoudou-workshop`

- 版本：`3`
- 当前用途：工作台项目和编辑器草稿。
- 代码来源：
  - `src/features/workshop/model/projectStore.ts`
  - `src/features/workshop/model/draftStore.ts`

#### Object Store: `projects`

- 主键：`projectId`
- 含义：一个工作台项目的完整本地记录，包括上传图、裁剪配置、生成图纸、编辑器状态和串珠进度。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `projectId` | `string` | 项目 ID，主键。 |
| `title` | `string` | 项目标题。 |
| `kind` | `'upload' \| 'pattern' \| 'progress'` | 项目类型：上传中、已生成图纸、串珠进度项目。 |
| `status` | `'editing' \| 'ready' \| 'paused' \| 'completed'` | 项目状态。 |
| `beadingState` | `'idle' \| 'progressing' \| 'completed'` | 串珠状态。 |
| `sourceType` | `'blank' \| 'upload' \| 'gallery'` | 来源：空白、用户上传、画册图纸。 |
| `sourceItemId` | `string \| null` | 来源画册条目 ID，非画册来源为空。 |
| `uploadedImage` | `object \| null` | 用户上传图片，包含 `name`、`type`、`size`、`dataUrl`、`width`、`height`。 |
| `cropTransform` | `object` | 裁剪变换，包含 `scale`、`x`、`y`、可选 `rotate`、`frameSize`。 |
| `config` | `object` | 图纸生成配置，包含 `canvasSize`、`brand`、`style`、`colorMergeThreshold`、可选 `algorithm`、`advanced`。 |
| `patternResult` | `object \| null` | 生成后的图纸数据，包含尺寸、格子、色板和统计信息。 |
| `viewMode` | `'image' \| 'pattern'` | 当前查看模式。 |
| `editorState` | `object \| null` | 编辑器网格状态，包含 `grid`、`history`、`historyIndex`。 |
| `progress` | `object \| null` | 旧的项目进度摘要，包含 `percent`、`step`、`updatedAt`。 |
| `beadingProgress` | `object \| null` | 串珠进度，包含当前颜色/格子、已完成颜色/格子、进度百分比、方向和板型设置。 |
| `coverUrl` | `string \| null` | 项目封面，可为 data URL 或远程 URL。 |
| `previewUrl` | `string \| null` | 项目预览图。 |
| `lastOpenedAt` | `string \| null` | 最近打开时间，ISO 字符串。 |
| `createdAt` | `string` | 创建时间，ISO 字符串。 |
| `updatedAt` | `string` | 更新时间，ISO 字符串。 |

`patternResult` 的主要结构：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `width` | `number` | 图纸宽度，单位为珠子格。 |
| `height` | `number` | 图纸高度，单位为珠子格。 |
| `cells` | `Array<object>` | 每个格子的颜色信息，包含 `x`、`y`、`colorId`、`vendorCode`、`hex`、可选 `isExternal`。 |
| `palette` | `Array<object>` | 色板统计，包含 `colorId`、`vendorCode`、`hex`、`count`。 |
| `stats` | `object` | 统计信息，包含 `totalCells`、`colorCount`。 |

#### Object Store: `editor-drafts`

- 主键：`draftId`
- `draftId` 格式：`draft:${projectId}`
- 含义：编辑器草稿。它和 `projects.editorState` 都属于本地编辑状态，`editor-drafts` 用于更直接地保存编辑器的完整草稿。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `draftId` | `string` | 草稿 ID，主键。 |
| `projectId` | `string` | 关联的工作台项目 ID。 |
| `state` | `object` | 编辑器状态，包含 `grid`、`history`、`historyIndex`。 |
| `updatedAt` | `number` | 更新时间戳，毫秒。 |
| `schemaVersion` | `number` | 草稿结构版本，目前为 `1`。 |

### 1.2 IndexedDB: `dodoudou-beads`

- 版本：`1`
- 当前用途：用户本机珠子库存。
- 代码来源：`src/features/beads/model/inventoryStore.ts`

#### Object Store: `inventory-items`

- 主键：`id`
- `id` 格式：`${brandKey}:${normalizedCode}`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 库存条目 ID，主键。 |
| `brandKey` | `string` | 品牌 key。 |
| `code` | `string` | 色号，保存时会转成大写。 |
| `hex` | `string` | 色值，例如 `#FFFFFF`。 |
| `quantity` | `number` | 当前库存数量，保存为非负整数。 |
| `lowStockThreshold` | `number \| undefined` | 低库存提醒阈值。 |
| `location` | `string \| undefined` | 收纳位置。 |
| `favorite` | `boolean` | 是否收藏/常用。 |
| `note` | `string \| undefined` | 备注。 |
| `updatedAt` | `string` | 更新时间，ISO 字符串。 |

### 1.3 IndexedDB: `dodoudou-local-projects`

- 版本：`1`
- 状态：历史兼容库，当前代码注释已标记为 deprecated。
- 当前主项目数据源已经迁移到 `dodoudou-workshop/projects`。
- 代码来源：`src/features/projects/model/localProjectStore.ts`

#### Object Store: `projects`

- 主键：`id`
- 旧结构字段：`id`、`title`、`kind`、`status`、`beadingState`、`coverUrl`、`previewUrl`、`sourceImage`、`pattern`、`progress`、`createdAt`、`updatedAt`、`lastOpenedAt`。

### 1.4 localStorage

localStorage 不是表结构，但当前项目仍有两个本机状态依赖它：

| Key | 类型 | 说明 |
| --- | --- | --- |
| `dodoudou.favoriteGalleryItemIds` | `string[]` 的 JSON 字符串 | 本机收藏的画册条目 ID。注意这不是后端收藏表，只影响当前浏览器。 |
| `dodoudou:workshop-editor-local-draft:${projectId}` | `WorkshopEditorState` 的 JSON 字符串 | 编辑器草稿的轻量兜底缓存。IndexedDB 草稿仍是主要保存方式。 |

## 2. SQLite 数据库

后端通过 Prisma Client 和 `@prisma/adapter-better-sqlite3` 访问 SQLite。

- 配置入口：`DATABASE_URL`
- 默认示例：`.env.example` 中为 `file:./dev.db`
- 服务端兜底：如果没有设置 `DATABASE_URL`，`server/db.mjs` 会使用项目根目录下的 `dev.db`
- 当前 Prisma schema：`prisma/schema.prisma`

### 2.1 当前 Prisma schema 中声明的枚举

| 枚举 | 可选值 | 说明 |
| --- | --- | --- |
| `GallerySourceType` | `official`、`community` | 图纸来源：官方或社区。 |
| `GalleryVisibility` | `public` | 可见性，目前只有公开。 |
| `GalleryItemStatus` | `draft`、`pending_review`、`published`、`rejected`、`offline` | 图纸状态。 |

### 2.2 表：`GalleryAuthor`

作者表。

| 字段 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | `String` | 主键 | 作者 ID。 |
| `name` | `String` | 必填 | 作者名。 |
| `avatarUrl` | `String?` | 可空 | 头像 URL。 |
| `createdAt` | `DateTime` | 默认 `now()` | 创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 更新时间。 |

关系：

- `GalleryAuthor` 1 对多 `GalleryItem`。

### 2.3 表：`GalleryAsset`

媒体资源表。封面、预览图、源图、导出文件都复用这张表。

| 字段 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | `String` | 主键 | 资源 ID。 |
| `type` | `String` | 必填 | 资源类型，例如 `cover`、`preview`、`source`、`export`、`avatar`。 |
| `url` | `String` | 必填 | 资源 URL，可以是远程 URL 或 data URL。 |
| `thumbUrl` | `String?` | 可空 | 缩略图 URL。 |
| `mimeType` | `String` | 必填 | MIME 类型。 |
| `width` | `Int?` | 可空 | 图片宽度。 |
| `height` | `Int?` | 可空 | 图片高度。 |
| `size` | `Int?` | 可空 | 文件大小，单位字节。 |
| `checksum` | `String?` | 可空 | 校验值。 |
| `createdAt` | `DateTime` | 默认 `now()` | 创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 更新时间。 |

关系：

- 可被 `GalleryItem.coverAssetId`、`previewAssetId`、`sourceAssetId`、`exportAssetId` 引用。

### 2.4 表：`GalleryItem`

画册图纸主表。列表页和详情页的核心数据来自这张表。

| 字段 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | `String` | 主键 | 图纸 ID。 |
| `title` | `String` | 必填 | 标题。 |
| `description` | `String?` | 可空 | 描述。 |
| `sourceType` | `GallerySourceType` | 默认 `community` | 来源。 |
| `visibility` | `GalleryVisibility` | 默认 `public` | 可见性。 |
| `status` | `GalleryItemStatus` | 默认 `published` | 状态。 |
| `authorId` | `String` | 外键 | 作者 ID。 |
| `coverAssetId` | `String` | 唯一，外键 | 封面资源 ID。 |
| `previewAssetId` | `String` | 唯一，外键 | 预览资源 ID。 |
| `sourceAssetId` | `String?` | 唯一，可空，外键 | 源图资源 ID。 |
| `exportAssetId` | `String?` | 唯一，可空，外键 | 导出文件资源 ID。 |
| `style` | `String` | 必填 | 图纸风格。 |
| `brand` | `String` | 必填 | 珠子品牌。 |
| `canvasSize` | `Int` | 必填 | 画布尺寸配置。 |
| `tagsJson` | `Json` | 必填 | 标签数组，例如 `["猫咪", "可爱"]`。 |
| `viewCount` | `Int` | 默认 `0` | 浏览次数。 |
| `likeCount` | `Int` | 默认 `0` | 点赞次数。 |
| `favoriteCount` | `Int` | 默认 `0` | 收藏次数。 |
| `downloadCount` | `Int` | 默认 `0` | 下载次数。 |
| `shareCount` | `Int` | 默认 `0` | 分享次数。 |
| `hotScore` | `Int` | 默认 `0` | 热度排序分。 |
| `coverWidth` | `Int?` | 可空 | 封面宽度。 |
| `coverHeight` | `Int?` | 可空 | 封面高度。 |
| `sortWeight` | `Int` | 默认 `0` | 人工排序权重。 |
| `createdAt` | `DateTime` | 默认 `now()` | 创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 更新时间。 |
| `publishedAt` | `DateTime?` | 可空 | 发布时间。 |

索引：

- `publishedAt`
- `sortWeight`
- `hotScore`

关系：

- `authorId` 指向 `GalleryAuthor.id`。
- `coverAssetId`、`previewAssetId`、`sourceAssetId`、`exportAssetId` 指向 `GalleryAsset.id`。
- 和 `GalleryPatternDetail` 是 1 对 1 关系。

### 2.5 表：`GalleryPatternDetail`

图纸详情表，保存完整图纸格子、色板、生成配置和来源元信息。

| 字段 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | `String` | 主键，默认 `cuid()` | 明细 ID。 |
| `itemId` | `String` | 唯一，外键 | 关联的 `GalleryItem.id`。 |
| `width` | `Int` | 必填 | 图纸宽度，单位为珠子格。 |
| `height` | `Int` | 必填 | 图纸高度，单位为珠子格。 |
| `beadCount` | `Int` | 必填 | 珠子总数。 |
| `paletteCount` | `Int` | 必填 | 色板颜色数。 |
| `colorStatsJson` | `Json` | 必填 | 颜色统计数组。 |
| `configJson` | `Json` | 必填 | 生成配置。 |
| `patternPayloadJson` | `Json` | 必填 | 完整图纸 payload。 |
| `sourceMetadataJson` | `Json?` | 可空 | 来源元信息。 |
| `createdAt` | `DateTime` | 默认 `now()` | 创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 更新时间。 |

JSON 字段结构：

| 字段 | 结构 |
| --- | --- |
| `colorStatsJson` | `[{ colorId, vendorCode, hex, count }]` |
| `configJson` | `{ canvasSize, brand, style, colorMergeThreshold }` |
| `patternPayloadJson` | `{ cells: [{ x, y, colorId, vendorCode, hex, isExternal? }], palette: [{ colorId, vendorCode, hex, count }], stats: { totalCells, colorCount } }` |
| `sourceMetadataJson` | `{ projectId?, uploadedImageName?, uploadedImageType?, uploadedImageSize? }` |

关系：

- `itemId` 指向 `GalleryItem.id`。
- 当前 Prisma schema 设置了 `onDelete: Cascade`，删除 `GalleryItem` 时会级联删除对应 `GalleryPatternDetail`。

## 3. 当前本机 `dev.db` 中还能看到的历史表

本机 `dev.db` 实际存在一些历史表，但它们已经不在当前 `prisma/schema.prisma` 中声明。除非后续重新接入，否则应视为旧版本残留或未来迁移参考。

另外，本机 `dev.db` 里的 `GalleryAuthor` 仍可能带有旧字段 `userId` 和唯一索引 `GalleryAuthor_userId_key`；当前 Prisma schema 中已经没有这个字段。新代码应以 `prisma/schema.prisma` 为准，排查本机数据时再参考 `dev.db` 的实际结构。

| 表 | 当前状态 | 说明 |
| --- | --- | --- |
| `User` | 历史表 | 用户账号表，字段包含 `email`、`username`、`phone`、`passwordHash`、`name`、`avatarUrl`、`role`、`status`、时间戳；`email`、`username` 和 `phone` 有唯一索引。 |
| `Session` | 历史表 | 登录会话表，包含 `userId`、`tokenHash`、`userAgent`、`ipAddress`、`expiresAt`；`tokenHash` 唯一。 |
| `OAuthAccount` | 历史表 | 第三方账号绑定表，包含 `provider`、`providerAccountId`；`provider + providerAccountId` 唯一。 |
| `GalleryFavorite` | 历史表 | 后端收藏表，包含 `userId`、`itemId`；当前前端收藏实际写在 localStorage 的 `dodoudou.favoriteGalleryItemIds`。 |
| `BeadInventoryItem` | 历史表 | 后端珠子库存表；当前前端库存实际写在 IndexedDB 的 `dodoudou-beads/inventory-items`。 |
| `WorkshopProject` | 历史表 | 后端工作台项目表；当前前端项目实际写在 IndexedDB 的 `dodoudou-workshop/projects`。 |
| `_prisma_migrations` | Prisma 系统表 | Prisma 迁移记录。 |

如果需要让 schema 和本机数据库完全一致，应先决定这些历史表是要保留并重新写回 Prisma schema，还是要通过迁移清理掉。

## 4. 画册数据清理顺序

只清理当前画册数据时，建议按依赖关系处理：

1. 如果本机 `dev.db` 存在旧表 `GalleryFavorite`，先清空它。
2. 清空 `GalleryPatternDetail`。
3. 清空 `GalleryItem`。
4. 清空 `GalleryAsset`。
5. 清空 `GalleryAuthor`。

当前 seed 脚本采用的顺序是：

```js
await prisma.galleryPatternDetail.deleteMany();
await prisma.galleryItem.deleteMany();
await prisma.galleryAsset.deleteMany();
await prisma.galleryAuthor.deleteMany();
```

如果需要兼容本机历史 `GalleryFavorite` 表，可以在最前面增加一条 raw SQL 删除：

```sql
DELETE FROM "GalleryFavorite";
```

## 5. 数据归属建议

- 官方免费图纸、社区图纸、图纸详情：以后端 SQLite 的 `Gallery*` 表为准。
- 用户正在编辑的项目、草稿、串珠进度：以浏览器 IndexedDB `dodoudou-workshop` 为准。
- 用户本机珠子库存：以浏览器 IndexedDB `dodoudou-beads` 为准。
- 本机收藏状态：当前以 localStorage 为准；如果未来需要账号同步，应重新启用或重建设计后端收藏表。
- 静态 JSON 画册数据：不再作为兜底数据源，避免与 SQLite 数据不完整或不一致。
