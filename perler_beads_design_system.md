# 🧸 拼豆助手 · 视觉设计规范

Perler Beads App · Design System v2.0 · 温馨手工坊 (Cozy Studio)

> 来源：`perler_beads_design_system(2).html`。此版本为合并版 Markdown；拆分版见同名 zip。

## 目录

- [01 · 色彩系统](#01-色彩系统)
- [02 · 字体与层级](#02-字体与层级)
- [03 · 间距系统 ⬅ 新增](#03-间距系统-新增)
- [04 · 圆角 & 阴影](#04-圆角-阴影)
- [05 · 动效规范 ⬅ 新增](#05-动效规范-新增)
- [06 · 组件状态 ⬅ 新增](#06-组件状态-新增)
- [07 · 响应式断点 ⬅ 新增](#07-响应式断点-新增)
- [08 · 空状态 & 引导 ⬅ 新增](#08-空状态-引导-新增)
- [09 · 无障碍规范 ⬅ 新增](#09-无障碍规范-新增)

## CSS Token 摘要

| Token | 值 | 类型 |
| --- | --- | --- |
| --c-primary | #D8B4E2 | Color |
| --c-primary-dark | #B48FCC | Color |
| --c-primary-light | #EDD9F5 | Color |
| --c-bg | #FDFBF7 | Color |
| --c-surface | #FFFFFF | Color |
| --c-text | #5D534A | Color |
| --c-text-muted | #9C9188 | Color |
| --c-text-hint | #C4BAB2 | Color |
| --c-mint | #B5EAD7 | Color |
| --c-mint-dark | #6DC4A8 | Color |
| --c-orange | #FFDAC1 | Color |
| --c-orange-dark | #E8A87C | Color |
| --c-border | rgba(93, 83, 74, 0.12) | Color |
| --c-border-mid | rgba(93, 83, 74, 0.22) | Color |
| --r-lg | 24px | Radius |
| --r-md | 16px | Radius |
| --r-sm | 10px | Radius |
| --shadow-card | 0 4px 24px rgba(216, 180, 226, 0.18), 0 1px 4px rgba(93, 83, 74, 0.06) | Shadow |
| --shadow-btn | 0 2px 12px rgba(216, 180, 226, 0.35) | Shadow |
| --font-title | 'ZCOOL KuaiLe', cursive | Font |
| --font-body | 'Nunito', sans-serif | Font |


# 01 · 色彩系统

## 主调色板 · Primary Palette

| 名称 | 色值 | 用途 |
| --- | --- | --- |
| Primary | #D8B4E2 | 核心按钮 / 激活态 |
| Primary Dark | #B48FCC | Hover / 按下态 |
| Primary Light | #EDD9F5 | 选中背景 / 标签 |
| Background | #FDFBF7 | 全局底色 |
| Surface | #FFFFFF | 卡片容器 |
| Text | #5D534A | 标题 / 正文 |
| Text Muted | #9C9188 | 辅助文字 ⬅ 新增 |
| Text Hint | #C4BAB2 | 占位符 / 提示 ⬅ 新增 |

## 点缀色 & 语义色 · Accent & Semantic

| 名称 | 色值 | 用途 |
| --- | --- | --- |
| Mint | #B5EAD7 | 上传 / 成功 |
| Mint Dark | #6DC4A8 | 成功深色态 ⬅ 新增 |
| Peach | #FFDAC1 | 提醒高亮 |
| Peach Dark | #E8A87C | 警告深色态 ⬅ 新增 |
| Rose | #F4B8BB | 错误 / 危险 ⬅ 新增 |
| Sky | #C7DFF7 | 信息提示 ⬅ 新增 |


# 02 · 字体与层级

| 层级 | 规格 | 示例 |
| --- | --- | --- |
| Display | KuaiLe / 28px / 1.3 | 拼豆创作坊 ✦ |
| Heading 1 | KuaiLe / 22px / 1.4 | 选择你的图案 |
| Heading 2 | Nunito 600 / 17px / 1.5 | 珠子颜色配置 |
| Body | Nunito 400 / 15px / 1.7 | 将你的图片上传，系统将自动转换为拼豆图纸，支持 PNG / JPG 格式。 |
| Caption | Nunito 400 / 12px / 1.6 | 共需 248 颗珠子 · 预计用时 2 小时 |
| Label / Tag | Nunito 600 / 11px / 大写 + 间距 | COLOR PALETTE |


# 03 · 间距系统 ⬅ 新增

| Token | 尺寸 | 用途 |
| --- | --- | --- |
| --sp-1 | 4px | 图标与文字内间距 |
| --sp-2 | 8px | 标签内边距、紧凑列表间距 |
| --sp-3 | 12px | 卡片内元素间距 |
| --sp-4 | 16px | 表单字段间距、导航项 |
| --sp-6 | 24px | 卡片内边距、section 间距 |
| --sp-8 | 32px | 页面区块间距 |
| --sp-12 | 48px | 大标题与内容区间距 |


# 04 · 圆角 & 阴影

## 圆角规范

| 圆角 | 用途 |
| --- | --- |
| 4px | 内部小元素 |
| 10px | 输入框 / Badge |
| 16px | 小卡片 / 按钮 |
| 24px | 主容器 / 大卡片 |
| 全圆角 | Pill 标签 / 头像 |

## 阴影层级

| 层级 | 用途 |
| --- | --- |
| Flat | 内嵌区域 / 禁用 |
| Subtle | 悬停前卡片 |
| Card (默认) | 主要卡片 |
| Float | 悬停 / 浮层 |
| Button | 主要按钮 |


# 05 · 动效规范 ⬅ 新增

| 动效类型 | 时长 / 曲线 | 用途 |
| --- | --- | --- |
| 微交互 | 80ms · ease-out | 按钮按下 / 复选框切换 |
| 状态切换 | 200ms · ease-in-out | Hover 变色 / 焦点环显示 |
| 页面过渡 | 320ms · ease-in-out | 页面切换 / 面板展开 |
| 弹出层 | 240ms · cubic-bezier(.34,1.56,.64,1) | Toast / Modal · 轻微回弹 |
| 图片转图纸 | 逐格显现 · 30ms/格 stagger | 拼豆格子逐一填色渲染 |
| 骨架屏 | shimmer · 1.4s linear ∞ | 内容加载占位 |

## 减弱动效

⚠️ 减弱动效模式：检测到 prefers-reduced-motion 时，所有 transition 降为 0ms，仅保留透明度变化。


# 06 · 组件状态 ⬅ 新增

## 按钮状态

| 状态 | 按钮/表现 |
| --- | --- |
| 默认 | 主按钮：开始创作；次按钮：查看图纸 |
| 禁用 | 开始创作（disabled，不可点击） |
| 加载中 | 生成中…（显示 spinner，文字透明） |

## 语义标签

| 文案 | 语义 |
| --- | --- |
| ✓ 已完成 | 成功 |
| ◐ 进行中 | 警告 / 进行中 |
| ✕ 失败 | 错误 / 失败 |
| ✦ AI 生成 | 信息 / AI 生成 |


# 07 · 响应式断点 ⬅ 新增

| 断点 | 范围 | 布局说明 |
| --- | --- | --- |
| xs | < 360px | 折叠手机 / 特小屏 |
| sm | 360–599px | 手机 · 单列布局 |
| md | 600–959px | 平板 · 2 列网格 |
| lg | 960–1279px | 桌面 · 3 列 / 侧边栏 |
| xl | ≥ 1280px | 宽屏 · 最大宽度 1440px |


# 08 · 空状态 & 引导 ⬅ 新增

## 标准空状态示例

| 元素 | 内容 |
| --- | --- |
| 图标 | 🧵 |
| 标题 | 还没有图纸哦 |
| 说明 | 上传一张图片，或让 AI 帮你生成第一张专属图案 |
| 行动按钮 | + 开始创作 |

## 规则

规则：使用手工坊插图 emoji · 标题用快乐体 · 虚线边框采用 Primary Light · 至少提供一个行动按钮


# 09 · 无障碍规范 ⬅ 新增

| 规范 | 级别 |
| --- | --- |
| 正文文字对比度 ≥ 4.5:1（WCAG AA） | 必须 |
| 所有可交互元素有 :focus-visible 轮廓，颜色 #D8B4E2，宽度 3px，offset 2px | 必须 |
| 点击区域最小 44×44px（含 padding 补充） | 必须 |
| 颜色信息不能作为唯一传递语义的方式（搭配图标或文字） | 必须 |
| 拼豆格子画布支持键盘方向键导航，当前格子有高亮描边 | 推荐 |
| 图像类内容提供 alt 文本，AI 生成图案说明主要形状与颜色 | 推荐 |
