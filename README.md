# 拼豆豆助手

这是“拼豆豆助手”的新项目代码库。

## 项目定位

面向拼豆（Perler Beads）创作者的治愈系辅助工具，优先支持移动端体验，核心流程覆盖：
- 灵感发现
- 图片裁剪
- 参数设置
- 图纸预览
- 图纸编辑
- 沉浸拼豆
- 作品收藏

## 当前架构目标

本项目采用“分层模块架构”，优先保证：
- 业务能力可拆分
- 页面可独立演进
- 通用能力可复用
- 视觉与交互规范可统一维护

## 推荐目录树

```text
src/
├── app/
│   ├── App.tsx
│   ├── navigation.ts
│   └── components/
│       └── BottomNav.tsx
├── pages/
│   ├── discovery/
│   │   └── DiscoveryPage.tsx
│   ├── workshop/
│   │   └── WorkshopPage.tsx
│   └── collection/
│       └── CollectionPage.tsx
├── widgets/
│   ├── app-header/
│   └── page-shell/
├── features/
│   ├── image-crop/
│   ├── pattern-settings/
│   ├── pattern-preview/
│   ├── pattern-editor/
│   ├── focus-mode/
│   └── download-settings/
├── entities/
│   ├── pattern/
│   ├── project/
│   ├── palette/
│   └── user/
├── shared/
│   ├── ui/
│   │   └── PlaceholderPage.tsx
│   ├── lib/
│   ├── hooks/
│   ├── constants/
│   ├── types/
│   └── styles/
└── styles/
    └── global.css
```

## 各目录职责说明

### `src/app`
应用入口层，只放“装配逻辑”和全局壳，不堆业务页面内容。

建议放入：
- 应用根组件
- 导航状态管理
- 全局布局组合
- 路由配置
- 启动级别的导航/权限/主题装配

### `src/pages`
页面层，一个目录对应一个完整页面或大场景。

建议放入：
- 发现页
- 工坊页
- 作品集页
- 裁剪页
- 参数设置页
- 预览页
- 编辑页
- 沉浸模式页

页面层的职责是“组合功能”，而不是写底层逻辑。

### `src/widgets`
跨页面复用的大块 UI 组合。

建议放入：
- 顶部栏
- 底部导航
- 页面骨架
- 卡片列表区
- 侧边栏/浮层容器

Widgets 通常比页面更通用，但比组件更接近业务。

### `src/features`
可独立演进的业务能力模块。

建议放入：
- 图片裁剪能力
- 图纸参数表单
- 图纸预览交互
- 手动编辑工具
- 下载设置
- 拼豆模式逻辑

Features 关注“功能”，不关注页面布局。

### `src/entities`
领域实体层，放稳定的业务模型和实体相关逻辑。

建议放入：
- 图纸 Pattern
- 项目 Project
- 配色 Palette
- 用户 User

如果某块数据会被多个页面和功能复用，优先放到实体层。

### `src/shared`
全局共享能力层，放最底层、最通用、与业务耦合最小的内容。

建议放入：
- 通用 UI 组件
- hooks
- 工具函数
- 常量
- 类型定义
- 全局设计变量

### `src/styles`
全局样式入口，承载基础视觉变量和跨页面样式。

建议放入：
- 全局色板
- 字体规则
- 间距规则
- 阴影规则
- 基础排版规范

---

## 后续页面开发规范

### 1. 页面拆分原则
- 一个页面对应一个 `pages` 目录
- 页面只负责组合，不直接写复杂业务逻辑
- 复杂能力优先下沉到 `features`
- 可复用结构优先提升到 `widgets`

### 2. 组件放置原则
- 只在单页使用：放页面目录内
- 多页复用且偏业务：放 `widgets`
- 多页复用且偏通用：放 `shared`
- 与具体领域强相关：放 `entities`

### 3. 命名规范
- 目录名使用小写短横线风格，例如 `image-crop`
- 页面组件使用 PascalCase，例如 `DiscoveryPage`
- 业务组件使用语义化命名，例如 `BottomNav`
- 文件名尽量与导出组件名一致

### 4. 页面开发顺序建议
推荐按产品流优先级开发：
1. `discovery` 首页
2. `workshop` 工坊入口
3. `image-crop` 裁剪页
4. `pattern-settings` 参数设置页
5. `pattern-preview` 图纸预览页
6. `pattern-editor` 编辑页
7. `focus-mode` 沉浸拼豆页
8. `download-settings` 下载设置页
9. `collection` 作品集页

### 5. 交互与视觉规范
- 移动端优先
- 保持温馨手作风统一视觉
- 复用设计变量，不在页面里硬编码大量颜色
- 交互优先支持“下一步”式流程
- 重要流程使用清晰的主按钮和渐进式曝光

### 6. 状态管理建议
- 页面局部状态优先使用组件 state
- 跨页面状态再考虑统一管理方案
- 不要在 `App.tsx` 直接堆业务数据
- 导航状态要和页面状态统一来源

## 开发命令

```bash
npm install
npm run dev
```
