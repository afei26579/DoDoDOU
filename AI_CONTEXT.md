# AI_CONTEXT

## 阶段总结

当前项目是拼豆图纸创作应用，近期主要围绕「画册页」「图纸详情页」「工坊参数区」「专注模式返回」做了连续调整。

### 已完成

1. 画册卡片视觉调整
   - 删除了图纸预览区域上方多余的紫色条状背景。
   - 卡片结构调整为：顶部紫色标题区 + 图纸预览区 + 底部紫色信息区。
   - 图纸预览区改成方形比例，避免标题和图纸之间出现空隙。
   - 底部说明中的 `颗豆` 改为 `颗`。

2. 工坊参数设计区调整
   - 尺寸滑块增加范围提示：`24` 到 `200`。
   - 容色滑块增加范围提示：`0` 到 `50`。
   - 同步修改实际滑块范围，并对旧数据做范围夹取。
   - 固定参数内容区高度，避免切换「尺寸 / 品牌 / 风格 / 容色」时页面上下跳动。

3. 画册图纸详情页
   - 新增 `/collection/:itemId` 图纸详情页。
   - 点击画册卡片会进入图纸详情页。
   - 详情页顶部右侧提供 3 个操作：`下载`、`编辑`、`拼豆`。
   - 下方用 canvas 绘制完整图纸，样式复用工坊下载图纸：标题、尺寸信息、标尺、网格、色号和物料清单。
   - 图纸在小屏手机和平板上会按可用视口等比例缩放，保证完整显示。
   - `下载` 会导出高清 PNG。
   - `编辑` 会把画册图纸保存成临时工坊项目后进入编辑器。
   - `拼豆` 会把画册图纸保存成临时工坊项目后进入专注模式。

4. 专注模式返回修复
   - 从画册详情页进入专注模式时，会携带 `returnTo` 来源路径。
   - 专注模式返回按钮优先返回来源页，因此画册进入时会回到图纸详情页。
   - 从工坊结果页进入专注模式时不携带 `returnTo`，仍保持原逻辑返回 `/workshop/result/:projectId`。

### 主要涉及文件

- `src/pages/collection/CollectionPage.tsx`
- `src/pages/collection/CollectionDetailPage.tsx`
- `src/app/App.tsx`
- `src/styles/global.css`
- `src/lib/pattern/download.ts`
- `src/pages/workshop/components/WorkshopParameterPanel.tsx`
- `src/pages/workshop/FocusModePage.tsx`

### 验证情况

已多次运行 `npm run check`。当前类型检查仍失败，但失败项是项目中已有的 TypeScript 问题，主要包括：

- `src/features/gallery/model/mock.ts` 中 mock 图纸缺少 `id`。
- `src/lib/pattern/download.ts` 中 `CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D` 类型不匹配。
- `src/lib/pattern/generator.ts` 中 `loadImage` 声明冲突。
- `src/pages/workshop/WorkshopEditorPage.tsx` 中 `PALETTE` 未定义。
- `src/pages/workshop/WorkshopHomePage.tsx` 中缺少 `onReuploadImage` 参数。
- `src/pages/workshop/WorkshopPage.tsx` 中回调签名不匹配。

这些错误不是本阶段新增功能直接引入的，但后续若要稳定构建，需要单独清理。

### 注意事项

- 当前画册详情页依赖画册详情接口返回的 `pattern.patternPayload.cells` 和 `palette`。如果画册数据只有封面，没有格子数据，详情页会提示缺少图纸格子数据。
- 从画册进入编辑/拼豆时，会创建 `gallery-${itemId}-${Date.now()}` 格式的临时工坊项目。
- `src/styles/global.css` 中同时包含本阶段画册卡片、详情页、工坊参数区的样式改动，后续改 UI 时需要注意这些区域的耦合。
