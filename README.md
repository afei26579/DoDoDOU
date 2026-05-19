# Dodoudou Assistant

拼豆豆助手是一个面向拼豆（Perler Beads）创作者的移动端优先 Web 应用，帮助用户从灵感发现、图片上传，到图纸生成、编辑、下载和专注拼豆，完成一套完整的创作流程。

## 项目概览

当前项目使用 `React + TypeScript + Vite` 构建，采用轻量分层的页面组织方式：

- `src/app`：应用装配层、路由与底部导航
- `src/pages`：具体页面场景
- `src/features`：业务能力与状态管理
- `src/lib`：图像处理、配色、导出等核心算法
- `src/shared`：通用 UI 组件
- `src/styles`：全局视觉样式

## 目前已实现的核心能力

### 1. 首页 / 灵感发现
- 发现页首页展示
- 图片上传入口
- 灵感卡片轮播展示
- 继续创作的项目列表展示

### 2. 工坊流程
- 上传图片并创建项目
- 基于项目 ID 保存与恢复流程状态
- 裁剪预览与拖拽调整
- 图纸参数配置
- 图纸生成
- 结果页查看
- 图纸统计信息展示
- 去背景处理
- 下载设置弹窗
- 结果页上传到画册

### 3. 图纸生成与导出
- 图片裁剪画布生成
- 图纸生成算法
- 调色板匹配与色号映射
- 颜色合并策略
- 图纸 PNG 导出
- 导出时支持网格、色号、水印、物料清单等配置

### 4. 画册数据与后端存储
- 公共画册图纸列表
- 图纸详情展示
- 画册上传表单
- Node.js + Express + Prisma + SQLite 后端
- 发布后自动写入 SQLite，并生成 `public/data/gallery/` JSON 文件

### 5. 手动编辑与专注模式
- 手动编辑图纸页面
- 工具切换：铅笔、橡皮、填充、取色
- 颜色板选择
- 拼豆专注模式页面

### 6. 作品集
- 作品集页面
- 状态筛选
- 卡片式作品展示

## 技术栈

- React 19
- React Router DOM 7
- TypeScript 5
- Vite 7
- Node.js + Express
- Prisma 7
- SQLite
- 浏览器原生 `IndexedDB` 用于保存项目数据
- Canvas / Image API 用于裁剪、生成和导出图纸

## 项目运行

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化数据库

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

### 3. 启动前后端

```bash
npm run dev:all
```

如果你只想单独启动：

```bash
npm run dev
npm run gallery:server
```

## 常用命令

```bash
npm run build
npm run check
npm run preview
npm run prisma:studio
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run gallery:server
npm run dev:all
```

## 环境变量

复制 `.env.example` 为 `.env` 后配置：

```bash
DATABASE_URL="file:./dev.db"
GALLERY_DEV_LAN_ENABLED="false"
GALLERY_SERVER_HOST="127.0.0.1"
GALLERY_SERVER_PORT="3001"
```

前端如果要直连后端，再补充：

```bash
VITE_API_BASE_URL=http://127.0.0.1:3001
VITE_USE_MOCK_GALLERY=false
```

也可以设为 `auto`，让前端按当前访问页面的 hostname 自动拼出 API 地址：

```bash
VITE_API_BASE_URL=auto
VITE_API_PORT=3001
```

开发阶段需要手机通过局域网访问时，把 `.env.local` 或 `.env` 里的开关改成：

```bash
GALLERY_DEV_LAN_ENABLED="true"
```

然后使用 `npm run dev:all` 启动。脚本会自动检测本机局域网 IP，并临时切换为：

- 后端监听 `0.0.0.0:3001`
- CORS 放行 `http://<局域网IP>:5173`
- 前端 API 地址使用 `http://<局域网IP>:3001`

如果自动检测到的 IP 不对，可以再指定：

```bash
GALLERY_DEV_LAN_HOST="192.168.1.226"
```

## 路由概览

- `/`：发现页
- `/workshop`：工坊首页
- `/workshop/create/:projectId`：图纸制作页
- `/workshop/result/:projectId`：图纸结果页
- `/workshop/editor/:projectId`：手动编辑页
- `/workshop/focus/:projectId`：拼豆专注模式
- `/collection`：作品集

## 关键实现说明

### 项目状态存储
工坊项目数据会按 `projectId` 保存到浏览器 `IndexedDB` 中，并配合内存缓存提高访问速度。

### 图纸生成逻辑
图纸生成主要位于 `src/lib/pattern/generator.ts`，包括：
- 图片加载
- 裁剪处理
- 网格采样
- 颜色系统映射
- 相近颜色合并
- 生成统计信息

### 导出逻辑
图纸导出位于 `src/lib/pattern/download.ts`，会根据用户配置绘制完整 PNG 图纸。

### 公共画册存储
公共画册数据使用 `Prisma + SQLite` 存储，发布时同步生成静态 JSON 到 `public/data/gallery/`，方便前端读取与调试。

## 当前项目定位

这个仓库已经不只是一个静态原型，而是具备了基础产品闭环的拼豆工具应用雏形。后续可以继续完善：
- 更完整的项目管理
- 更强的编辑能力
- 更丰富的导出样式
- 更真实的作品集数据
- 更细腻的移动端交互体验

## 开发建议

如果你要继续扩展这个项目，建议优先完善以下方向：
1. 统一工坊流程的状态流转
2. 补全裁剪、参数、预览、结果之间的路由关系
3. 提升手动编辑器的可用性
4. 增加真实数据源与持久化能力
5. 完善导出配置与预览一致性
