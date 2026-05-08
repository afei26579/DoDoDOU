# 项目本地数据与状态机方案

## 目标

统一浏览器本地数据管理，确保同一个 `projectId` 的作品在任意时刻只有一个明确状态，并且支持以下能力：

- 上传图片后自动创建项目
- 生成图纸后默认进入“已完成”
- 进入编辑页后自动切为“草稿”
- 点击保存/完成后切回“已完成”
- 进入专注模式后记录“进行中”进度
- “我的”页可以正确展示最近打开、草稿、图纸、进行中项目

---

## 一、具体数据结构

### 1. 核心实体：`LocalProjectRecord`

统一使用一个本地项目实体承载用户创作数据。

```ts
export type ProjectPaperState = 'draft' | 'completed';
export type BeadingState = 'idle' | 'progressing' | 'completed';

export type LocalProjectRecord = {
  id: string;
  title: string;
  paperState: ProjectPaperState;
  beadingState: BeadingState;
  status: 'editing' | 'ready' | 'paused' | 'completed';

  uploadedImage?: {
    name: string;
    type: string;
    size: number;
    dataUrl: string;
    width: number;
    height: number;
  } | null;

  cropTransform?: {
    scale: number;
    x: number;
    y: number;
    rotate?: number;
  } | null;

  config?: {
    canvasSize: number;
    brand: 'MARD' | 'COCO' | '漫漫' | '盼盼' | '咪小窝';
    style: '写实' | '动漫' | '极简';
    colorMergeThreshold: number;
  } | null;

  pattern?: {
    width: number;
    height: number;
    beadCount: number;
    paletteCount: number;
  } | null;

  editorState?: {
    grid: string[][];
    history: string[][][];
    historyIndex: number;
  } | null;

  progress?: {
    percent: number;
    step?: string;
    updatedAt?: string;
  } | null;

  coverUrl?: string | null;
  previewUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string | null;
};
```

---

### 2. 字段解释

#### `paperState`
图纸状态，只允许两种：
- `draft`：草稿
- `completed`：已完成

#### `beadingState`
拼豆状态，表示是否进入专注模式：
- `idle`：未开始
- `progressing`：进行中
- `completed`：拼豆完成

#### `status`
用于列表展示的高层状态：
- `editing`：编辑中
- `ready`：可用/已完成
- `paused`：暂停中
- `completed`：整体完成

> 说明：`status` 是更宽泛的展示状态；`paperState` 和 `beadingState` 是业务状态。

---

### 3. 状态约束

同一个 `projectId` 在“图纸维度”上只能处于一个状态：

- 要么是 `draft`
- 要么是 `completed`

进入编辑页后，必须先切为 `draft`。
点击保存/完成后，必须切回 `completed`。

---

## 二、状态机转换表

### 1. 图纸状态机

| 当前状态 | 触发事件 | 下一个状态 | 说明 |
|---|---|---|---|
| `completed` | 上传图片并生成图纸 | `completed` | 默认就是已完成 |
| `completed` | 打开 `workshop/editor/:projectId` | `draft` | 进入编辑页即草稿 |
| `draft` | 点击保存 | `completed` | 保存后回到已完成 |
| `draft` | 点击“完成”按钮 | `completed` | 完成并退出编辑页 |
| `draft` | 离开编辑页但未保存 | `draft` 或保留未提交状态 | 需按实现决定是否自动保存 |

---

### 2. 拼豆状态机

| 当前状态 | 触发事件 | 下一个状态 | 说明 |
|---|---|---|---|
| `idle` | 点击“拼豆”进入专注模式 | `progressing` | 创建或更新进行中记录 |
| `progressing` | 保存进度 | `progressing` | 继续保持进行中 |
| `progressing` | 拼豆完成 | `completed` | 记录完成状态 |
| `completed` | 再次进入专注模式 | `progressing` | 允许重新开始或继续 |

---

### 3. 项目整体状态建议

项目最终对外展示时，可以按优先级合成：

1. 如果 `paperState === 'draft'`，显示为“草稿”
2. 否则如果 `beadingState === 'progressing'`，显示为“拼豆进行中”
3. 否则显示为“已完成”

---

## 三、页面行为规则

### 1. 上传图片

入口：
- 发现页 `DiscoveryPage`
- 工坊页上传入口

行为：
- 创建新的 `projectId`
- 写入本地项目记录
- 初始状态为：
  - `paperState = 'completed'`
  - `beadingState = 'idle'`
  - `status = 'ready'`

说明：
- 上传图片本身不算草稿
- 只有进入编辑页后才变草稿

---

### 2. 生成图纸

入口：
- 工坊生成按钮

行为：
- 生成 pattern 数据
- 更新同一个 `projectId`
- 图纸状态保持或切回：
  - `paperState = 'completed'`
  - `status = 'ready'`

说明：
- 图片转图纸默认就是已完成
- 这是正式图纸结果

---

### 3. 打开编辑页

入口：
- 点击“手动编辑”
- 点击“编辑图纸”
- 新建空白画布进入 `workshop/editor/:projectId`

行为：
- 同一个 `projectId` 切换为：
  - `paperState = 'draft'`
  - `status = 'editing'`
- 保存编辑器状态到本地

说明：
- 只要进入编辑页，就认为是草稿
- 空白画布初始也是草稿

---

### 4. 编辑页保存按钮

入口：
- `WorkshopEditorPage`

行为：
- 将编辑后的内容写回本地
- 切换状态为：
  - `paperState = 'completed'`
  - `status = 'ready'`
- 退出编辑页并返回上一页

说明：
- 保存即完成
- 该操作要保证状态和数据同时更新

---

### 5. 编辑页“完成”按钮

入口：
- `WorkshopEditorPage`

行为：
- 将草稿标记为已完成
- 保存当前编辑结果
- 退出编辑页
- 返回上一页

说明：
- 这是与“保存”同级的完成操作
- 主要用于明确结束编辑流程

---

### 6. 进入专注模式“拼豆”

入口：
- 图纸详情页
- 图纸结果页
- 编辑页后续进入专注模式

行为：
- 创建或更新本地“进行中”记录
- `beadingState = 'progressing'`
- 保存当前进度：
  - 完成百分比
  - 当前步骤
  - 更新时间

说明：
- 这是独立于图纸草稿/完成状态的进度状态
- 可以和“已完成图纸”并存，但业务展示上要有优先级

---

### 7. “我的”页展示规则

展示分区：
- 最近打开
- 草稿
- 图纸
- 拼豆进行中

建议规则：
- `paperState === 'draft'` 的项目进入“草稿”
- `paperState === 'completed'` 的项目进入“图纸”
- `beadingState === 'progressing'` 的项目进入“拼豆进行中”
- 最近打开按 `lastOpenedAt` 排序

---

## 四、需要修改的文件列表

### 1. 数据层

- `src/features/workshop/model/projectStore.ts`
  - 扩展统一项目记录
  - 维护图纸状态与进行中状态
  - 增加状态切换方法

- `src/features/projects/model/localProjectStore.ts`
  - 如果继续保留独立本地项目表，需要与 `projectStore` 同步
  - 若后续完全统一，可考虑移除或合并

---

### 2. 工作坊流程

- `src/features/workshop/model/useWorkshopFlow.ts`
  - 进入编辑时切草稿
  - 保存/完成时切已完成
  - 同步写入本地数据

- `src/pages/workshop/WorkshopShell.tsx`
  - 生成图纸后默认已完成
  - 进入编辑页前后状态切换
  - 新建项目时初始化状态

---

### 3. 编辑器页面

- `src/pages/workshop/WorkshopEditorPage.tsx`
  - 进入页面时强制切为草稿
  - 增加“完成”按钮
  - 保存后退出编辑页并返回上一页
  - 统一写回本地数据库

---

### 4. 专注模式 / 拼豆

- `src/pages/workshop/FocusModePage.tsx`
  - 进入时创建或更新“进行中”状态
  - 保存拼豆进度
  - 完成时更新状态

---

### 5. 画册页 / 我的页

- `src/pages/collection/CollectionPage.tsx`
  - 按状态分组展示本地项目
  - 区分草稿、图纸、进行中
  - 支持点击跳转

---

### 6. 路由与入口

- `src/app/App.tsx`
  - 新建画布时初始化记录
  - 保证路由切换时状态正确

---

### 7. 样式

- `src/styles/global.css`
  - 适配“我的”页 2 列布局
  - 本地项目卡片样式
  - 状态标签样式
  - 空状态样式

---

## 五、推荐实现顺序

1. 先在 `projectStore.ts` 中明确状态字段和更新方法
2. 再改编辑页的草稿 / 完成切换
3. 再改工坊生成与保存逻辑
4. 再接专注模式进度保存
5. 最后统一“我的”页展示

---

## 六、最终原则

### 图纸状态原则
同一个 `projectId` 任意时刻只能处于一个图纸状态：
- `draft`
- `completed`

### 拼豆状态原则
拼豆“进行中”是独立状态，但必须保存到同一个项目记录里。

### 数据一致性原则
任何状态切换都必须同时更新：
- 存储数据
- 页面展示
- 路由行为

这样才能保证“我的”页、编辑器、结果页、专注模式之间不会互相打架。
