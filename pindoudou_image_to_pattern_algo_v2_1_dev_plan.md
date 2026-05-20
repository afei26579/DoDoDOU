# 图片转图纸算法 v2.1 开发计划

> 基于 `pindoudou_image_to_pattern_algo_v2_1.md`，结合当前 Dodoudou 项目代码结构整理。  
> 目标是把 v2.1 技术方案拆成可执行、可验收、可回滚的开发任务。

## 1. 当前项目理解

### 1.1 现有生成链路

当前图片转图纸入口在：

- `src/pages/workshop/WorkshopShell.tsx`
  - `handleGeneratePattern`
  - 调用 `generatePatternFromImage`
  - 保存 `PatternResult`
  - 跳转到结果页

- `src/lib/pattern/generator.ts`
  - 加载图片
  - 按裁剪参数生成 Canvas
  - 读取 `ImageData`
  - 按 `canvasSize x canvasSize` 切格
  - 每格取代表色
  - 匹配品牌色卡
  - 合并相近颜色
  - 生成 `PatternResult`

现有核心流程可以概括为：

```text
图片 / 裁剪参数
  -> Canvas
  -> ImageData
  -> 网格采样
  -> RGB 最近色匹配
  -> RGB 相近色合并
  -> PatternResult
```

### 1.2 现有算法行为

`src/lib/pattern/generator.ts` 当前主要函数：

- `colorDistance`
  - 使用 RGB 欧氏距离。

- `findClosestPaletteColor`
  - 在当前品牌色卡中找 RGB 距离最近的颜色。

- `getRepresentativeColor`
  - `写实` 使用平均色。
  - `动漫` / `极简` 使用出现频次最高的原始 RGB。
  - alpha 小于 128 的像素会被忽略。

- `mergeSimilarCells`
  - 统计每个色号使用次数。
  - 从高频色开始，把 RGB 距离小于阈值的低频色合并到高频色。

- `toMergeThreshold`
  - 将 `colorMergeThreshold` 和 `style` 映射成 RGB 合并阈值。

### 1.3 现有数据结构约束

下游预览、编辑、下载、专注模式、画册发布都依赖：

- `src/features/workshop/model/types.ts`
  - `WorkshopConfig`
  - `PatternCell`
  - `PatternPaletteEntry`
  - `PatternResult`

因此 v2.1 必须保持最终输出结构不变：

```ts
type PatternResult = {
  width: number;
  height: number;
  cells: PatternCell[];
  palette: PatternPaletteEntry[];
  stats: {
    totalCells: number;
    colorCount: number;
  };
};
```

### 1.4 当前主要缺口

和 v2.1 方案相比，当前缺少：

- 固定测试图片、baseline JSON、baseline 截图和可量化指标。
- Lab 色彩空间转换。
- CIEDE2000 色差。
- topK 预筛，当前是全量 RGB 最近色。
- 色卡 Lab 缓存。
- 截尾平均采样，当前平均/众数容易受噪声、抗锯齿和 JPEG 压缩影响。
- match confidence，当前无法判断某格匹配是否可靠。
- 连通区域 cleanup，当前只能做全局近色合并。
- debug stats，当前只能看到最终颜色数和豆子数。
- Worker 友好的纯函数核心，当前算法与 Canvas / DOM 入口耦合。

## 2. 开发原则

1. `PatternResult` 不破坏下游。
2. `generator.ts` 保留为对外入口，但逐步退化为 DOM / Canvas 适配层。
3. 新算法核心放到纯函数模块，输入 `ImageData` 和色卡，输出内部工作数据。
4. 先建立 baseline，再替换算法。
5. v2.1 不引入 Floyd-Steinberg 抖动、Sobel 边缘保护、硬颜色预算和完整 Web Worker。
6. 旧的 `colorMergeThreshold` 暂时保留，映射到 v2.1 的保守合并强度，避免 UI 参数失效。
7. 新增 debug 信息默认不写入持久化 `PatternResult`，只在开发调试通道暴露。

## 3. 推荐文件结构

按 v2.1 文档落地到当前项目：

```text
src/lib/pattern/
  generator.ts              # 对外入口，负责图片加载、裁剪、ImageData 获取
  generate-core.ts          # Worker 友好的纯算法主流程
  algo-types.ts             # WorkingCell / PatternWorkingData / debug 类型
  pattern-size.ts           # sizeTier 判断和默认参数
  color-convert.ts          # sRGB -> linear RGB -> XYZ -> Lab
  delta-e.ts                # CIEDE2000
  palette-cache.ts          # 品牌色卡 Lab 缓存
  color-match.ts            # topK + CIEDE2000 精排
  grid-sampling.ts          # Lab 截尾平均采样
  confidence.ts             # match confidence / cell confidence
  color-merge.ts            # 简化版颜色合并
  region-cleanup.ts         # 4 连通区域 cleanup
  debug-stats.ts            # 指标统计
```

建议新增开发辅助目录：

```text
src/lib/pattern/__fixtures__/
  README.md                 # 固定测试图片说明

scripts/
  pattern-benchmark.mjs     # 生成 baseline 指标和结果快照

public/data/pattern-benchmark/
  baseline/                 # baseline JSON / 截图，按需纳入版本管理
```

## 4. 分阶段开发计划

### Phase 0：基准测试集和当前算法快照

目标：先固定比较对象，避免后续凭肉眼判断算法好坏。

任务：

- 整理 5 类固定测试图：
  - 人像 / 头像。
  - 宠物或复杂毛发。
  - logo / 扁平图。
  - JPEG 压缩明显的图片。
  - 带透明边缘或白底主体的图片。

- 每张图至少跑：
  - `canvasSize = 48`
  - `canvasSize = 100`
  - `canvasSize = 160`

- 记录现有算法输出：
  - `PatternResult` JSON。
  - 预览截图。
  - 颜色数。
  - 总豆数。
  - 孤立格数量。
  - 生成耗时。

- 增加一个 benchmark 脚本或开发页。

验收：

- 能稳定复跑同一批图片。
- 当前算法 baseline 有可查看 JSON 和截图。
- 后续每一阶段都能与 baseline 对比。

建议工期：0.5 - 1 天。

### Phase 1：拆出纯算法核心 + Lab / CIEDE2000 / topK

目标：先替换颜色匹配基础，不碰复杂 cleanup。

任务：

- 新增 `algo-types.ts`：
  - `RGBColor`
  - `LabColor`
  - `WorkingCell`
  - `PatternWorkingData`
  - `PatternDebugInfo`

- 新增 `pattern-size.ts`：
  - `getPatternSizeTier`
  - `DEFAULT_PARAMS`
  - style 和旧 `colorMergeThreshold` 的兼容映射。

- 新增 `color-convert.ts`：
  - sRGB gamma correction。
  - RGB -> XYZ。
  - XYZ -> Lab。

- 新增 `delta-e.ts`：
  - CIEDE2000。
  - 加标准样例测试，防公式偏差。

- 新增 `palette-cache.ts`：
  - 按品牌色卡生成 Lab 缓存。
  - 避免每格重复转换色卡。

- 新增 `color-match.ts`：
  - 先用 Lab 欧氏距离取 topK。
  - 只对 topK 做 CIEDE2000 精排。
  - 返回 best / secondBest / deltaGap。

- 新增 `generate-core.ts` 初版：
  - 暂时沿用简单采样。
  - 用新匹配替换 RGB 最近色。

- 改造 `generator.ts`：
  - 保留图片加载和裁剪。
  - 将 `ImageData`、`canvasSize`、`palette`、`config` 传给 `generatePatternCore`。
  - 调用 `toPatternResult` 输出原结构。

验收：

- `npm run check` 通过。
- `PatternResult` shape 和下游页面不变。
- CIEDE2000 调用次数符合 topK 预期。
- baseline 图片中明显偏色格减少。
- 生成耗时没有不可接受上涨。

建议工期：1 - 1.5 天。

### Phase 2：Lab 截尾平均采样

目标：提升每个网格代表色的稳定性，减少噪声和边缘脏色。

任务：

- 新增 `grid-sampling.ts`：
  - 对每格像素过滤低 alpha。
  - 像素 RGB 转 Lab。
  - 计算初步均值。
  - 按距离均值的 Lab 距离排序。
  - 去掉头尾异常值后取截尾平均。
  - 输出 `sourceRgb`、`sourceLab`、`variance`、`alphaRatio`、`isTransparent`。

- 按尺寸档位设置 `trimRatio`：
  - small 更保守。
  - medium 平衡。
  - large 可稍积极。

- 透明处理：
  - alphaRatio 过低的格子保持 `isExternal`。
  - 透明边缘不参与色卡匹配。

验收：

- JPEG 噪声图更稳定。
- 透明边缘不产生脏色。
- 抗锯齿边缘不再明显偏移。
- small 尺寸不丢关键小结构。

建议工期：1 天。

### Phase 3：match confidence

目标：让后续合并和 cleanup 知道哪些格子该保护，哪些格子更像噪声。

任务：

- 新增 `confidence.ts`：
  - 使用 `bestDeltaE`、`secondBestDeltaE`、`deltaGap`、`variance`、`alphaRatio` 计算 confidence。
  - 输出 `matchConfidence` 和 `cellConfidence`。

- 扩展 `color-match.ts`：
  - 每个格子保留 best / secondBest。
  - 记录 `deltaGap`。

- 扩展 debug stats：
  - avgDeltaE。
  - p95DeltaE。
  - extremeDeltaERatio。

验收：

- 每个 `WorkingCell` 都能拿到 confidence 字段。
- confidence 不进入最终 `PatternResult`。
- cleanup 可以读取 confidence 做保护。

建议工期：0.5 天。

### Phase 4：保守颜色合并 + 连通区域 cleanup

目标：减少明显无意义碎点，同时避免误删眼睛、高光、嘴角等关键结构。

任务：

- 新增 `color-merge.ts`：
  - 基于 Lab / DeltaE 做低风险近色合并。
  - 只合并低使用量、低 confidence、非常接近的颜色。
  - 保留旧 `colorMergeThreshold` 对合并强度的影响。

- 新增 `region-cleanup.ts`：
  - 按 `matchedColorId` 做 4 连通块。
  - 统计 block area、avgConfidence、avgDeltaE、avgVariance、neighborInfos。
  - 根据 sizeTier 计算面积阈值。
  - small 尺寸使用强保守规则。
  - 只在有 dominant neighbor 且邻色足够接近时替换。

- 更新 `generate-core.ts` 主流程：
  - sampling。
  - matching。
  - confidence。
  - color merge。
  - region cleanup。
  - debug stats。

验收：

- 明显孤立杂点减少。
- small 尺寸关键细节不明显丢失。
- 总颜色数不异常增加。
- 人工对比评分不低于 baseline。

建议工期：1 - 1.5 天。

### Phase 5：debug stats 和开发可视化

目标：让算法调参可解释、可复盘。

任务：

- 新增 `debug-stats.ts`：
  - `isolatedCellCount`
  - `smallBlockCount`
  - `cleanedCellCount`
  - `preservedCellCount`
  - `generationTimeMs`
  - `samplingTimeMs`
  - `matchingTimeMs`
  - `cleanupTimeMs`
  - `ciedeCallCount`
  - `topK`
  - `paletteCacheHit`

- 提供开发调试入口：
  - 可以先做 benchmark JSON 输出。
  - UI overlay 可后置，但至少需要能定位 cell 被清理或保留的原因。

验收：

- 能看到每阶段耗时。
- 能看到 cleaned / preserved 数量。
- 能定位单个 cell 的清理原因。

建议工期：0.5 - 1 天。

### Phase 6：集成回归和发布准备

目标：确认算法替换没有破坏产品闭环。

任务：

- 检查以下页面和能力：
  - 工坊生成页。
  - 结果预览。
  - 统计面板。
  - 手动编辑。
  - 下载 PNG。
  - 一键去背景。
  - 自动裁去空白区域。
  - 水平镜像。
  - 专注模式。
  - 画册发布 / 详情读取。

- 性能检查：
  - 48x48、100x100、160x160 三档。
  - 至少在移动端视口验证交互不卡死。

- 回归策略：
  - 如果 v2.1 输出异常，保留一处快速切回旧算法的内部开关。
  - 旧算法可以临时保留为 `generatePatternLegacy`，等 v2.1 稳定后删除。

验收：

- `npm run check` 通过。
- 生成、查看、编辑、下载、专注模式全链路可用。
- benchmark 指标和截图纳入评审。

建议工期：0.5 - 1 天。

## 5. 里程碑安排

| 里程碑 | 内容 | 产出 | 预计 |
|---|---|---|---:|
| M0 | baseline 建立 | 测试图、JSON、截图、指标 | 0.5 - 1 天 |
| M1 | 新匹配核心 | Lab、CIEDE2000、topK、纯 core 初版 | 1 - 1.5 天 |
| M2 | 新采样 | 截尾平均采样、透明处理 | 1 天 |
| M3 | confidence | cell confidence 和 debug 基础指标 | 0.5 天 |
| M4 | cleanup | 保守合并、连通区域清理 | 1 - 1.5 天 |
| M5 | 回归发布 | debug stats、全链路验证 | 1 - 2 天 |

整体预计：5 - 7 个开发日。

## 6. 验收指标

### 6.1 算法指标

- `avgDeltaE` 下降或保持稳定。
- `p95DeltaE` 下降。
- `extremeDeltaERatio` 下降。
- `isolatedCellCount` 下降。
- `colorCount` 不异常增加。
- small 尺寸人工评分不下降。

### 6.2 性能指标

参考 v2.1 文档目标：

- 48x48：明显小于 100ms。
- 100x100：尽量控制在 300ms 内。
- 160x160：尽量控制在 800ms 内。

若移动端性能不足，优先调小 topK 或推迟更激进 cleanup，不在 v2.1 直接上完整 Worker。

### 6.3 产品回归指标

- 生成结果能正常预览。
- 统计色号和格子颜色一致。
- 编辑器能正确读写新结果。
- 下载图纸和物料清单不丢色号。
- 专注模式能按新图纸正常生成拼豆计划。

## 7. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| CIEDE2000 实现错误 | 匹配颜色整体偏移 | 使用标准样例测试，先独立验收 |
| 新算法性能变慢 | 移动端生成卡顿 | topK 控制调用次数，缓存色卡 Lab，阶段耗时打点 |
| cleanup 误删细节 | 人像眼睛、高光、logo 线条丢失 | small 尺寸强保守，confidence 高则保护 |
| debug 信息污染持久化数据 | IndexedDB / 画册 payload 变大 | debug 只存在内部 working data，不进入 `PatternResult` |
| 旧 UI 参数语义变化 | 用户感觉 slider 失效 | `colorMergeThreshold` 暂时映射到保守合并强度 |
| 下游兼容问题 | 编辑、下载、专注模式出错 | 保持 `PatternResult` 不变，全链路回归 |

## 8. 不进入 v2.1 的内容

- Floyd-Steinberg 抖动。
- Sobel 边缘保护。
- hard color budget。
- 多风格复杂参数系统。
- 完整 Web Worker 架构。
- 端上 AI 分割或语义区域识别。

这些能力可以进入 v2.2 或更后续版本。

## 9. 推荐实施顺序

优先级从高到低：

1. 建 baseline。
2. 拆 `generatePatternCore`，保持 `PatternResult` 输出不变。
3. 实现 Lab / CIEDE2000 / topK。
4. 实现 Lab 截尾平均采样。
5. 增加 confidence。
6. 实现保守颜色合并。
7. 实现连通区域 cleanup。
8. 加 debug stats 和 benchmark 对比。
9. 做全链路回归。

这条路线能先拿到颜色匹配收益，再逐步加入可制作性优化；每一步都有可回退边界，不需要一次性重写整条生成链路。
