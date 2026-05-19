# 内测阶段服务器防护方案

## 当前定位

当前项目是无登录的内测版本，前端为 `React + Vite`，后端为 `Express + Prisma + SQLite`。服务端当前主要承担公共画册读取和作品发布写入能力：

- `GET /api/gallery/items`
- `GET /api/gallery/items/:id`
- `POST /api/gallery/publish`

内测阶段暂时不开放图纸上传到画册，因此写接口默认关闭。读取接口可以开放给前端调试，写接口必须通过配置显式开启。

## 核心风险

1. **未登录写入风险**：没有用户系统时，任何可访问后端的人都可能伪造 `POST /api/gallery/publish`。
2. **跨站请求风险**：如果 CORS 任意放行，其他站点也可以诱导浏览器请求本服务。
3. **资源消耗风险**：图纸数据和 base64 图片可能很大，恶意请求会占用内存、CPU、SQLite 写锁和磁盘。
4. **数据污染风险**：攻击者可以伪造标题、标签、作者、图片地址、图纸数据，污染公共画册。
5. **文件写入风险**：如果客户端可控制文件名或 ID，可能造成路径穿越或覆盖非预期文件。

## 防护原则

1. **默认关闭写接口**：内测期不开放图纸上传，`GALLERY_PUBLISH_ENABLED` 默认 `false`。
2. **默认本机监听**：后端默认监听 `127.0.0.1`，避免开发机或测试机意外暴露到局域网。
3. **CORS 白名单**：只允许配置中的前端域名访问 API。
4. **请求限流**：全局接口和发布接口分别限流，发布接口更严格。
5. **请求大小限制**：限制 JSON body 大小，防止大 payload 打爆内存。
6. **写入前强校验**：校验字段类型、长度、数值范围、数组大小、图片 URL 类型。
7. **服务端生成写入 ID**：不再信任客户端传来的 `itemId`，写文件前再次校验路径仍在目标目录。
8. **可配置调试**：开发阶段可以通过环境变量打开发布、关闭 token、调整 CORS 和限流。

## 推荐部署结构

内测推荐结构：

```text
Browser
  -> HTTPS / Basic Auth / Access Gateway
  -> Frontend static site
  -> Reverse proxy
  -> 127.0.0.1:3001 Express API
  -> SQLite
```

推荐优先级：

1. 只在本机或 VPN 内访问。
2. 若需要公网内测，使用 Nginx Basic Auth、Cloudflare Access、Tailscale Funnel 或类似访问网关。
3. 后端端口不要直接暴露公网。
4. 写接口即便打开，也应同时启用 `GALLERY_REQUIRE_WRITE_TOKEN=true`。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `GALLERY_SERVER_HOST` | `127.0.0.1` | 后端监听地址。内测不要使用 `0.0.0.0`，除非有代理或防火墙保护。 |
| `GALLERY_SERVER_PORT` | `3001` | 后端端口。 |
| `GALLERY_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | CORS 白名单，多个域名用逗号分隔。测试时可设为 `*`，不建议长期使用。 |
| `GALLERY_JSON_BODY_LIMIT` | `5mb` | JSON body 大小限制。 |
| `GALLERY_PUBLISH_ENABLED` | `false` | 是否开放 `POST /api/gallery/publish`。内测默认关闭。 |
| `GALLERY_REQUIRE_WRITE_TOKEN` | `true` | 发布接口是否要求写入 token。 |
| `GALLERY_WRITE_TOKEN` | 空 | 发布接口 token。请求头使用 `X-Internal-Token` 或 `Authorization: Bearer <token>`。 |
| `GALLERY_RATE_LIMIT_WINDOW_MS` | `60000` | 限流窗口。 |
| `GALLERY_RATE_LIMIT_MAX` | `120` | 全局限流窗口内最大请求数。 |
| `GALLERY_PUBLISH_RATE_LIMIT_MAX` | `5` | 发布接口限流窗口内最大请求数。 |
| `GALLERY_MAX_PATTERN_CELLS` | `10000` | 单个图纸最大格子数。 |
| `GALLERY_MAX_DATA_URL_CHARS` | `1500000` | 单个 data URL 最大字符数。 |
| `GALLERY_TRUST_PROXY` | `false` | 是否信任反向代理传入的客户端 IP。部署在可信代理后方时可设为 `true`。 |
| `VITE_ENABLE_GALLERY_PUBLISH` | `false` | 前端是否显示上传图纸入口。 |

## 开发调试配置

只读调试，也就是当前内测默认推荐：

```env
GALLERY_SERVER_HOST="127.0.0.1"
GALLERY_SERVER_PORT="3001"
GALLERY_ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
GALLERY_PUBLISH_ENABLED="false"
VITE_ENABLE_GALLERY_PUBLISH="false"
```

本机临时测试发布接口：

```env
GALLERY_PUBLISH_ENABLED="true"
GALLERY_REQUIRE_WRITE_TOKEN="false"
VITE_ENABLE_GALLERY_PUBLISH="true"
```

内测环境临时开放发布接口：

```env
GALLERY_SERVER_HOST="127.0.0.1"
GALLERY_ALLOWED_ORIGINS="https://beta.example.com"
GALLERY_PUBLISH_ENABLED="true"
GALLERY_REQUIRE_WRITE_TOKEN="true"
GALLERY_WRITE_TOKEN="replace-with-long-random-token"
VITE_ENABLE_GALLERY_PUBLISH="true"
```

注意：浏览器前端里的任何 token 都不是秘密。如果需要公网内测，仍建议使用代理层 Basic Auth、VPN 或 Access Gateway。

## 接口行为

### 读取接口

读取接口允许在 CORS 白名单内访问，并受到全局限流保护。未知 `Origin` 会被拒绝。

### 发布接口

发布接口按顺序执行：

1. 检查 `GALLERY_PUBLISH_ENABLED`。
2. 如果要求 token，校验 `X-Internal-Token` 或 `Authorization: Bearer <token>`。
3. 执行发布接口专用限流。
4. 校验 payload。
5. 服务端生成安全 `itemId`。
6. Prisma 写入 SQLite。
7. 写入 `public/data/gallery/items/<itemId>.json`，并校验最终路径没有逃逸目标目录。

## 后续增强

正式开放前建议补齐：

1. 用户登录和权限系统。
2. 文件上传服务，避免把大图直接塞进 JSON。
3. 内容审核队列，把发布状态从 `published` 改为 `pending_review`。
4. 操作审计日志持久化。
5. 数据库从 SQLite 迁移到更适合并发写入的服务。
6. 代理层 WAF、HTTPS、备份和恢复策略。
