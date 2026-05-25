# DoDouDou 服务器运维手册

## 服务器维护常用命令

### Nginx
```bash
sudo nginx -t                                     # 检查配置语法
sudo systemctl reload nginx                       # 平滑重载配置（不中断请求）
sudo systemctl restart nginx                      # 完全重启
sudo systemctl status nginx                       # 查看运行状态
cat /etc/nginx/sites-available/beads-app          # 查看站点配置
```

### PM2
```bash
pm2 status                                        # 查看所有进程状态
pm2 start ecosystem.config.cjs                    # 启动
pm2 restart DoDouDou                              # 重启
pm2 stop DoDouDou                                 # 停止
pm2 delete DoDouDou                               # 删除
pm2 logs DoDouDou                                 # 查看日志
pm2 logs DoDouDou --lines 50                      # 查看最近 50 行日志
pm2 monit                                         # 实时监控
pm2 save                                          # 保存进程列表
pm2 startup                                       # 设置开机自启
```

### SSL 证书
```bash
sudo certbot renew                                # 续期证书
sudo certbot renew --dry-run                      # 模拟续期（验证配置是否正确）
```

### 项目更新
```bash
cd /var/www/DoDouDou
git pull origin main                              # 拉取最新代码
npm install                                       # 安装依赖（依赖有变化时）
npm run build                                     # 重新构建前端
npx prisma migrate deploy                         # 执行数据库迁移（有变化时）
pm2 restart DoDouDou                              # 重启后端
sudo systemctl reload nginx                       # 重载 Nginx（配置有变化时）
```

### 权限
```bash
sudo chown -R $USER:$USER /var/www/DoDouDou       # 重置整个项目目录权限
sudo chown $USER:$USER /var/www/DoDouDou/dev.db   # 单独设置数据库文件权限
```

### 日志查看
```bash
pm2 logs DoDouDou --lines 100                     # 后端运行日志
sudo tail -f /var/log/nginx/error.log             # Nginx 错误日志
sudo tail -f /var/log/nginx/access.log            # Nginx 访问日志
sudo journalctl -u nginx -n 50                    # systemd Nginx 日志
```

---

## 部署错误记录

## 错误 1：`ecosystem.config.js` ES Module 报错

**现象**
```
ReferenceError: module is not defined in ES module scope
```

**原因**
`package.json` 里有 `"type": "module"`，导致 PM2 配置文件被当作 ESM 处理，`module.exports` 语法不兼容。

**解决**
```bash
mv ecosystem.config.js ecosystem.config.cjs
pm2 start ecosystem.config.cjs
```

---

## 错误 2：PM2 找不到入口文件

**现象**
```
Error: Script not found: /var/www/Dodoudou/server/gallery-server.mjs
```

**原因**
`cwd` 路径大小写写错，配置里写的是 `Dodoudou`，实际目录是 `DoDouDou`，Linux 路径区分大小写。

**解决**
修改 `ecosystem.config.cjs` 中的 `cwd`：
```js
cwd: '/var/www/DoDouDou',  // 大小写必须与实际目录完全一致
```

---

## 错误 3：Certbot 申请证书失败（DNS 未解析）

**现象**
```
DNS problem: NXDOMAIN looking up A for www.ylongf.xyz
no valid A records found for ylongf.xyz
```

**原因**
域名没有添加 A 记录，Let's Encrypt 无法访问到服务器。

**解决**
去阿里云云解析 DNS 控制台，添加两条 A 记录：

| 记录类型 | 主机记录 | 记录值 |
|---------|---------|--------|
| A | `@` | `47.86.231.0` |
| A | `www` | `47.86.231.0` |

---

## 错误 4：Certbot 验证失败（SPA 拦截了验证请求）

**现象**
```
Detail: Invalid response from http://ylongf.xyz/.well-known/acme-challenge/...
"<!doctype html><html lang="zh-CN">..."
```

**原因**
Nginx 的 `try_files` 把 `/.well-known/acme-challenge/` 的请求返回了 `index.html`，Let's Encrypt 收到的是前端页面而非验证文件。

**解决**
在 `location /` 之前加优先匹配规则：
```nginx
location ^~ /.well-known/acme-challenge/ {
    root /var/www/html;
    allow all;
}
```

---

## 错误 5：Certbot 验证仍失败（HTTP 被重定向到 HTTPS）

**现象**
同错误 4，仍返回 SPA 页面内容，加了 `acme-challenge` 规则后依然失败。

**原因**
Certbot 生成的第二个 `server` 块对 80 端口做了 `return 301` 全局重定向，验证请求在到达 `acme-challenge` 规则之前就被跳转走了。

**解决**
将 Nginx 配置拆分为独立的两个 `server` 块：
```nginx
# HTTP 80：先处理验证，再重定向
server {
    listen 80;
    server_name ylongf.xyz www.ylongf.xyz;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS 443：主站逻辑
server {
    listen 443 ssl;
    server_name ylongf.xyz www.ylongf.xyz;
    # ... 其余配置
}
```

---

## 错误 6：`certbot renew --dry-run` 模拟续期报错

**现象**
```
Certbot failed to authenticate some domains (authenticator: nginx)
All simulated renewals failed.
```

**原因**
`--dry-run` 是强制模拟续期，会重新走一遍完整验证流程，对环境要求更严格，在某些配置下会误报失败。

**解决**
证书本身有效，跳过模拟直接运行真实续期命令即可：
```bash
sudo certbot renew
```

---

## 错误 7：数据库目录路径不符

**现象**
```
chown: cannot access '/var/www/beads-app/server/prisma': No such file or directory
```

**原因**
部署指南预设路径为 `server/prisma/`，实际数据库文件位于项目根目录。

**解决**
先确认实际位置再设置权限：
```bash
find /var/www/DoDouDou/server -name "*.db"
# 实际路径为 /var/www/DoDouDou/dev.db

sudo chown $USER:$USER /var/www/DoDouDou/dev.db
sudo chown -R $USER:$USER /var/www/DoDouDou
```
