# 响应式布局重构计划

## 背景

Dodoudou Assistant 当前已经具备移动端优先的产品方向，但前端布局仍处于“移动端基础 + 桌面端补丁”的混合状态。主要样式集中在 `src/styles/global.css`，编辑器和专注模式分别使用 CSS Module：

- `src/styles/global.css`
- `src/pages/workshop/WorkshopEditorPage.module.css`
- `src/pages/workshop/focus/FocusModePage.module.css`
- `src/pages/workshop/editor/EditorSettingsSheet.module.css`

本次重构目标是将布局系统整理为真正的移动端优先响应式布局，在不改变核心视觉风格和业务逻辑的前提下，提高小屏可用性、平板适配和桌面空间利用率。

## 总体目标

1. 移动端作为默认布局，不再依赖大量 `max-width` 规则修补小屏。
2. 使用 `min-width` 断点逐步增强平板和桌面布局。
3. 统一页面容器、底部导航、安全区、固定操作栏、弹窗和画布尺寸规则。
4. 消除横向溢出、固定高度挤压、底部导航遮挡和工具栏遮挡画布的问题。
5. 保持现有业务组件结构稳定，仅在必要时做轻量结构调整。

## 响应式断点

建议统一使用以下断点：

| 断点 | 用途 |
| --- | --- |
| `360px` | 极窄手机兼容 |
| `480px` | 常规大屏手机增强 |
| `640px` | 小平板、横屏手机 |
| `900px` | 工坊双栏、桌面布局起点 |
| `1200px` | 宽屏内容密度优化 |

默认样式面向移动端，断点只用于向更大屏幕增强。

## 全局布局策略

### 1. 应用壳层

涉及文件：

- `src/app/App.tsx`
- `src/styles/global.css`

调整方向：

- 保留 `app-shell` 和 `layered-shell` 作为普通页面统一容器。
- 移动端默认全宽纵向滚动。
- 统一页面左右边距变量，例如：
  - `--page-padding-inline`
  - `--page-padding-block`
  - `--bottom-nav-height`
  - `--safe-bottom`
- 桌面端再限制内容宽度或增强为居中布局。
- fullscreen 页面继续使用 `app-shell--fullscreen` / `layered-shell--fullscreen`，但避免普通页面使用负 margin 撑满屏幕。

### 2. 底部导航

涉及文件：

- `src/app/components/BottomNav.tsx`
- `src/styles/global.css`

调整方向：

- 移动端底部导航固定在底部，并明确占用安全区。
- 页面主体通过统一 padding 预留底部空间。
- 桌面端可继续使用浮动胶囊导航，但需要和固定 CTA、FAB 保持间距一致。
- 避免页面单独硬编码 `84px`、`88px` 等底部距离。

### 3. 通用网格

调整方向：

- 默认单列或内容自然流。
- 使用 `repeat(auto-fit, minmax(...))` 替代固定 `repeat(2)`、`repeat(3)`。
- 卡片、表单、统计项使用稳定的 `minmax(0, 1fr)` 防止文本撑宽。
- 横向滚动列表必须限制在父容器内，避免页面整体横向溢出。

## 页面改造计划

## 阶段一：全局基础和移动端基线

优先级：最高

目标：

- 建立统一布局变量。
- 整理普通页面容器。
- 修正小屏横向溢出。
- 统一底部导航和 fixed action 的安全区规则。

任务：

1. 在 `:root` 或 `.app-shell` 中增加布局变量。
2. 调整 `app-shell`、`layered-shell`、`bottom-nav`。
3. 把小屏修补规则从 `@media (max-width: ...)` 逐步改成默认样式。
4. 保留现有视觉 token，不在本阶段重做配色。

验收标准：

- `320px` 宽度下无页面级横向滚动。
- 普通页面内容不被底部导航遮挡。
- fullscreen 页面不受普通页面 padding 影响。

## 阶段二：首页和画册页

涉及页面：

- `/`
- `/collection`

涉及文件：

- `src/pages/discovery/DiscoveryPage.tsx`
- `src/pages/collection/CollectionPage.tsx`
- `src/styles/global.css`

### 首页

调整方向：

- 移动端顺序保持为：标题、快捷入口、继续拼豆或新手引导、灵感画廊。
- 快捷入口默认适配极窄手机，可在 `480px+` 保持双列。
- 新手引导默认单列，`640px+` 改为多列。
- 灵感画廊保留横向内容，但父容器必须限制溢出。

### 画册页

调整方向：

- 当前画册瀑布流在 React 中固定拆成两列，响应式能力有限。
- 建议后续改为扁平卡片列表，由 CSS 控制列数。
- 移动端默认 2 列，极窄屏可退为 1 列。
- `640px+` 使用 3 列，`1024px+` 使用 4 列。
- “我的”页内的最近打开、我的图纸、我的拼豆使用 `auto-fit/minmax`。

验收标准：

- 画册卡片在手机、平板、桌面都能自然换列。
- 筛选栏不会挤压或撑宽页面。
- 收藏、状态标签、卡片标题不互相覆盖。

## 阶段三：工坊创建和结果页

涉及页面：

- `/workshop`
- `/workshop/create/:projectId`
- `/workshop/result/:projectId`

涉及文件：

- `src/pages/workshop/WorkshopPage.tsx`
- `src/pages/workshop/components/*`
- `src/styles/global.css`

### 移动端基线

默认布局顺序：

1. 顶部引导区
2. 方形画布
3. 工具栏
4. 参数面板或结果面板
5. 主操作按钮

调整方向：

- 画布尺寸同时考虑宽度和高度，避免短屏下挤压下方控件。
- 当前 `--canvas-side` 主要基于 `100vw`，需要引入可用高度约束。
- 参数面板默认保持紧凑纵向布局。
- 结果页主 CTA 使用统一 sticky/fixed action 规则，不单独依赖底部导航高度。

### 桌面增强

`900px+`：

- 左侧画布。
- 右侧工具栏、参数面板、结果面板、操作按钮。
- 画布尺寸使用 `min(可用宽度, 可用高度)`。
- 右侧栏宽度限制在适合操作的范围内，例如 `320px` 到 `430px`。

验收标准：

- 上传前、裁剪中、生成后、结果页四种状态都不出现遮挡。
- 结果页底部主按钮不遮挡统计和次级操作。
- 桌面端画布和右侧面板高度协调，不产生大片无意义空白。

## 阶段四：库存页

涉及页面：

- `/workshop/inventory`

涉及文件：

- `src/pages/beads/BeadInventoryPage.tsx`
- `src/styles/global.css`

调整方向：

- 表单默认单列，`640px+` 再切换为两列。
- 库存概览移动端保持可读，极窄屏降低 padding 或允许横向滚动。
- 筛选栏移动端默认纵向堆叠，平板以上切换为多列。
- 库存条目移动端使用单列信息流，操作按钮可换行。

验收标准：

- 表单输入框不会被压缩到难以点击。
- 库存列表长文本省略合理。
- 修改、删除、常用标签在小屏上不溢出。

## 阶段五：画册详情页

涉及页面：

- `/collection/:itemId`

涉及文件：

- `src/pages/collection/CollectionDetailPage.tsx`
- `src/styles/global.css`

调整方向：

- 当前 `.gallery-detail-page` 使用负 margin 撑满页面，建议改为明确的 fullscreen detail 布局。
- 顶部操作栏固定高度，画布区域使用剩余空间。
- 移动端优先保证图纸预览最大化。
- 桌面端可居中显示画布，并限制最大宽高。

验收标准：

- 图纸预览不会被顶部栏或底部区域遮挡。
- 加载、错误、空图纸状态不会压缩画布容器。
- 不依赖父容器 padding 的负值抵消。

## 阶段六：编辑器页面

涉及页面：

- `/workshop/editor/:projectId`

涉及文件：

- `src/pages/workshop/WorkshopEditorPage.tsx`
- `src/pages/workshop/WorkshopEditorPage.module.css`
- `src/pages/workshop/editor/EditorSettingsSheet.module.css`

调整方向：

- 继续作为 fullscreen 工具页处理。
- 移动端优先保证顶部标题栏、画布、底部工具栏互不遮挡。
- 顶部按钮过多时允许横向滚动，但不挤压返回按钮和标题。
- 预览浮窗默认避开顶部按钮和底部工具栏。
- 底部工具栏使用安全区变量，避免贴近系统手势区域。
- 设置 sheet 默认底部弹出，平板和桌面可限制宽度并居中。

验收标准：

- 小屏下标题可省略但按钮可点击。
- 画布可操作区域不被工具栏永久遮住。
- 颜色选择、缩放、工具切换在横屏手机和平板上可用。

当前进度：

- 已优先处理桌面端阻断问题：`/workshop/editor/:projectId` 打开后图纸完整显示在可视舞台内，不再被底部工具栏遮住。
- 已修复桌面端工具栏点击问题，`画笔 / 橡皮 / 填充 / 取色 / 平移` 可正常点击并切换激活态。
- 已通过 `1280x800` 与 `1024x768` 浏览器验证：画布在舞台内、位于工具栏上方、无页面级横向溢出。
- 已运行 `npm run check` 并通过。

剩余工作：

- 继续验证移动端、横屏短高和平板尺寸下的标题栏、预览浮窗、底部工具栏和设置 sheet。
- 检查缩放、重置视图、色卡弹窗、下载弹窗在小屏和短屏下是否仍可完整操作。
- 视情况将编辑器画布尺寸计算中的舞台宽高约束整理为更稳定的 helper，减少后续专注模式重复实现。

## 阶段七：专注模式

涉及页面：

- `/workshop/focus/:projectId`

涉及文件：

- `src/pages/workshop/focus/FocusModePage.tsx`
- `src/pages/workshop/focus/FocusModePage.module.css`
- `src/pages/workshop/focus/FocusToolbar.tsx`
- `src/pages/workshop/focus/FocusSettingsSheet.tsx`

调整方向：

- fullscreen 页面保留绝对定位，但统一使用安全区和工具栏尺寸变量。
- 顶部栏、标尺、底部工具栏之间的距离通过变量计算。
- 小屏下减少工具栏横向固定宽度，保证当前色号区域不挤出。
- 设置 sheet 和色号列表 sheet 统一底部弹出规则。
- 桌面端可扩大底部工具栏宽度，增加色号信息显示空间。

验收标准：

- 标尺不盖住顶部操作区。
- 底部工具栏不盖住当前操作焦点。
- 色号列表在小屏可滚动，关闭按钮始终可见。

## 阶段八：弹窗和 Sheet 统一

涉及组件：

- `DownloadSettingsModal`
- `WorkshopCreateSettingsSheet`
- `WorkshopResultStatsSheet`
- `EditorSettingsSheet`
- `FocusSettingsSheet`
- `FocusToolbar` 色号列表

调整方向：

- 移动端统一为底部 sheet。
- `640px+` 可保持底部 sheet 或切换为居中 modal，按功能复杂度决定。
- 统一宽度、最大高度、圆角、安全区、滚动区域。
- 表单行默认单列，宽屏再横向排列。

验收标准：

- 所有弹窗在 `320px` 宽度下可完整操作。
- 弹窗内部滚动不带动页面背景滚动。
- 关闭按钮、主按钮始终可见或容易到达。

## 第三轮开发计划：库存页和画册详情页

前置状态：

- 第一轮已完成全局布局基线、底部导航安全区和主要横向溢出治理。
- 第二轮已完成 `/workshop/create/:projectId` 与 `/workshop/result/:projectId` 的深水区响应式修复，包括画布高度约束、移动端 fixed 主按钮、工具栏换行、结果统计压缩、下载弹窗和物料统计 sheet 内部滚动。
- 原第三轮计划继续处理普通页面体系内的剩余高收益页面，先收 `/workshop/inventory` 与 `/collection/:itemId`。
- 实际执行已插入 `/workshop/editor/:projectId` 桌面端阻断项修复；库存页和画册详情页仍未开始，继续作为下一批普通页面收口任务。

### 范围

涉及页面：

- `/workshop/inventory`
- `/collection/:itemId`

涉及文件：

- `src/pages/beads/BeadInventoryPage.tsx`
- `src/pages/collection/CollectionDetailPage.tsx`
- `src/styles/global.css`

### 目标

1. 库存页在 `320px` 到桌面宽度下保持表单、筛选、列表和操作按钮可读可点。
2. 画册详情页建立明确的 fullscreen detail 布局，不依赖普通页面 padding 的负值或隐式抵消。
3. 图纸预览区域同时受顶部操作栏、底部安全区和短屏高度约束，不被状态提示或按钮挤压到不可用。
4. 继续复用第一、二轮建立的 `--safe-*`、`--bottom-nav-*`、`--page-padding-*` 等变量，减少页面级硬编码。
5. 为后续编辑器和专注模式整理可复用的 fullscreen 验证经验。

### 任务拆分

1. 库存页移动端基线
   - 概览统计在极窄屏保持三项可读，必要时压缩 padding、字号和数字行高。
   - 录入表单默认单列，输入框、选择框、常用色开关和提交按钮保持稳定触控尺寸。
   - 筛选栏默认纵向堆叠，搜索、品牌选择和常用按钮不撑宽页面。
   - 库存条目使用 `42px swatch + minmax(0, 1fr)` 的稳定主列，备注、位置和低库存文案做省略。
   - 修改、删除、常用标签在小屏可换行，但不改变卡片宽度。

2. 库存页平板和桌面增强
   - `640px+` 保持表单两列和筛选栏多列，但所有列使用 `minmax(0, 1fr)` 或明确最小宽度。
   - 评估 `900px+` 是否将录入面板与列表分成左右两区；如果会造成滚动和编辑态跳转成本，则保留单列宽内容。
   - 列表操作区在宽屏右对齐，小屏回落到下一行。
   - 页面底部空间继续交给全局壳层和底部导航变量处理，避免新增固定 `84px`、`88px`。

3. 画册详情页 fullscreen 布局
   - 明确 `.gallery-detail-page` 的顶部栏、状态提示和画布区域高度关系。
   - 顶部返回按钮和“下载 / 编辑 / 拼豆”操作在 `320px` 宽度下不互相挤压，操作区允许内部横向滚动或换行。
   - 画布容器使用 `min-height: 0`、`overflow: hidden/auto` 和安全区变量，避免页面级滚动穿透。
   - 加载、错误、空图纸、缺格子数据状态不压缩图纸预览到不可操作。
   - `ResizeObserver` 触发的 canvas 适配继续以容器尺寸为准，CSS 不强行拉伸 canvas 像素内容。

4. 画册详情页短屏和桌面增强
   - 覆盖 `320x568`、横屏短高和 `1024x768`，确认顶部栏不会吃掉主要预览空间。
   - 桌面端限制画布最大宽高，避免预览贴边或出现大片无意义空白。
   - 宽屏下操作栏与画布视觉中心对齐，保持图纸本身是第一视觉焦点。

5. 回归和验收
   - 运行 `npm run check`。
   - 用浏览器截图验证关键视口：`320x568`、`360x740`、`390x844`、`768x1024`、`1024x768`、`1280x800`。
   - 两个页面都检查 `document.documentElement.scrollWidth <= window.innerWidth`。
   - 检查底部导航、固定按钮、顶部栏和弹层 z-index 未出现新的遮挡。

### 本轮不做

- 不重构 `/workshop/focus/:projectId`，它进入后续 fullscreen 工具页专项。
- `/workshop/editor/:projectId` 已先行修复桌面端阻断项，但完整移动端、短屏和 sheet 收口仍归入后续编辑器专项。
- 不重做库存业务逻辑、画册接口和下载渲染逻辑。
- 不引入新的设计系统组件；只在必要时做轻量结构调整。
- 不统一所有弹窗和 sheet，仅修复本轮页面直接暴露的问题。

### 验收标准

- `/workshop/inventory` 在 `320px` 宽度下无页面级横向滚动，录入、筛选、编辑、删除都可完成。
- 库存列表长文本、常用标签和操作按钮不会互相覆盖。
- `/collection/:itemId` 的图纸预览不被顶部栏、状态提示或底部安全区遮挡。
- 画册详情页在加载、错误、空数据和正常图纸四种状态下布局稳定。
- `1024x768` 和 `1280x800` 下两个页面都有合理内容密度，不只是放大移动端布局。

## 验证矩阵

建议使用以下视口逐页验证：

| 类型 | 尺寸 |
| --- | --- |
| 极窄手机 | `320x568` |
| 常规手机 | `360x740` |
| iPhone 常见尺寸 | `390x844` |
| 大屏手机 | `430x932` |
| 小平板 | `768x1024` |
| 小桌面 | `1024x768` |
| 桌面 | `1280x800` |
| 宽桌面 | `1440x900` |

需要覆盖的页面：

- `/`
- `/workshop`
- `/workshop/create/:projectId`
- `/workshop/result/:projectId`
- `/workshop/editor/:projectId`
- `/workshop/focus/:projectId`
- `/workshop/inventory`
- `/collection`
- `/collection/:itemId`

## 验收清单

- 页面无意外横向滚动。
- 文本不溢出按钮、卡片、标签和工具栏。
- fixed/sticky 元素不互相遮挡。
- 底部导航、FAB、主 CTA 有一致的安全区距离。
- 画布在短屏和横屏下仍可操作。
- 弹窗和 sheet 在小屏可完整完成任务。
- 桌面端不是简单放大移动端，而是合理利用左右空间。
- `npm run check` 通过。
- 关键页面通过浏览器截图验证移动端和平板/桌面布局。

## 建议实施顺序

1. 全局布局变量、壳层、底部导航。
2. 首页和画册页。
3. 工坊创建页和结果页。
4. 库存页。
5. 画册详情页。
6. 编辑器页面。
7. 专注模式。
8. 弹窗和 sheet 统一收尾。

这个顺序优先处理影响面最大、风险最高的布局，再逐步处理 fullscreen 工具页面，便于每个阶段独立验证和回滚。
