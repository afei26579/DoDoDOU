# AI_CONTEXT

## 当前项目概览

当前项目是拼豆图纸创作应用，主要页面包括：

- 发现页：首页入口、新手引导、灵感画廊。
- 画册页：展示已发布/推荐图纸列表。
- 图纸详情页：展示完整图纸，可下载、编辑、进入专注拼豆。
- 工坊页：上传图片、裁剪、参数设置、生成图纸。
- 编辑器：手动画布编辑、空白画布创作。
- 专注模式：按图纸进行拼豆查看。

## 最近完成内容

### 1. 类型检查修复

已修复此前 `npm run check` 中列出的 TypeScript 问题，并确认通过。

主要修复：

- `src/features/gallery/model/mock.ts`
  - 为 mock 画册图纸补充 `pattern.id`。
  - 为 mock 画册详情项补充 `updatedAt`。
  - 列表返回中保留 `previewUrl`，供发现页灵感画廊使用。
- `src/features/gallery/model/types.ts`
  - `GalleryItemCard` 增加可选 `previewUrl`。
- `src/lib/pattern/download.ts`
  - 内部绘图函数支持 `CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D`。
  - 修复空 cell 的类型收窄问题。
- `src/lib/pattern/generator.ts`
  - 修复 `loadImage` 导入与本地声明冲突。
- `src/pages/workshop/WorkshopEditorPage.tsx`
  - 补充 `PALETTE` 导入。
- `src/pages/workshop/WorkshopHomePage.tsx`
  - 补充 `onReuploadImage` 回调。
- `src/pages/workshop/components/WorkshopPreviewArea.tsx`
  - 修正 `onPointerUp` 回调签名。

### 2. 发现页灵感画廊接入画册数据

发现页中“灵感画廊”原本使用固定占位数据，现已改为从画册列表加载最新 5 条图纸。

实现细节：

- 使用 `fetchGalleryList({ pageSize: 5, sort: 'latest' })`。
- 卡片图片优先使用 `item.previewUrl`，没有时回退 `item.coverUrl`。
- 卡片只展示图纸预览图和名称。
- 保留原有卡片背景色 tone 样式，不改变背景色体系。
- 卡片可点击，跳转到 `/collection/:itemId` 图纸详情页。
- 支持键盘 `Enter` / 空格进入详情页。
- 灵感卡片宽度保持不变，高度增大，图片使用 `object-fit: contain`，避免图纸被裁剪。

相关文件：

- `src/pages/discovery/DiscoveryPage.tsx`
- `src/features/gallery/model/api.ts`
- `src/features/gallery/model/types.ts`
- `src/features/gallery/model/mock.ts`
- `src/styles/global.css`

### 3. 发现页首页结构调整

参考用户提供的首页截图，已调整发现页中部结构：

- 首页标题右侧兔子/头像已移除。
- 原“继续拼豆”区域暂时不显示。
- 中部改为“新手入门”三步卡片。
- “新手入门”内容：
  - 上传照片：挑选你喜欢的照片或灵感图。
  - 转换图纸：AI 自动为你生成像素拼豆图纸。
  - 沉浸拼豆：对照图纸，开启你的手工时光。
- 新手入门卡片背景改成参考图风格的暖白/米色柔和渐变，并添加白色边框。
- 保留三步圆形编号的柔和配色。

相关文件：

- `src/pages/discovery/DiscoveryPage.tsx`
- `src/styles/global.css`

### 4. 发现页顶部入口卡片调整

发现页顶部两张大卡片原本是：

- 照片变图纸
- AI 灵感生成

由于 `AI 灵感生成` 暂未实现，已临时替换为新的入口：

- 标题：新的开始
- 小字：创建空白画布

交互：

- “照片变图纸”仍触发图片上传并进入工坊。
- “新的开始”会进入一个新的空白编辑器画布：`/workshop/editor/:projectId`。
- 样式沿用原有大卡片设计。

相关文件：

- `src/pages/discovery/DiscoveryPage.tsx`
- `src/app/App.tsx`

## 当前验证状态

最近一次验证：

```bash
npm run check
```

结果：通过。

## 注意事项

- `AI_CONTEXT.md` 之前出现过中文乱码，本次已重写为干净 UTF-8 中文内容。
- `src/styles/global.css` 同时承载发现页、画册详情页、工坊参数区等多处样式，后续修改 UI 时要注意不要误伤已有区域。
- 当前“继续拼豆”功能尚未完成，因此发现页暂不渲染继续拼豆区域。
- 当前“AI 灵感生成”功能尚未完成，因此发现页顶部第二张入口卡片已临时替换为“新的开始”。
- 画册 mock 数据目前只有少量图纸；灵感画廊会按实际返回数量展示，最多取最新 5 条。
