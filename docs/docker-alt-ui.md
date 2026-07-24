# 在 Docker 部署中使用 Floway Alt UI

本文介绍如何在 Floway 官方 Docker Compose 部署中，用 Floway Alt UI
替换镜像内置的 Vue 管理界面。替换只影响 Web 界面；Floway 网关、SQLite
数据库、文件目录、环境变量和对外 API 均保持不变。

## 工作方式

本仓库根目录的 `Dockerfile` 是
`Floway/docker/Dockerfile` 的替换版本。它保留 Floway 原有的两个构建目标：

- `server`：构建并运行 Floway Node 网关；
- `web`：检出并构建 Floway Alt UI，再由 Nginx 提供静态文件。

替换版继续使用 Floway 自带的 `docker/nginx.conf`。该配置不仅负责 SPA
路由回退，还会把 `/auth`、`/api`、`/v1`、WebSocket 和 SSE 等请求转发到
`server:8788`。本仓库不再提供单独的 `nginx.conf`，也不应删除 Floway
仓库中的这份配置。

## 前置条件

- 已安装 Docker，并支持 Docker Compose；
- 已分别获取 Floway 和 Floway Alt UI；
- 两个仓库的版本应当兼容。Alt UI 依赖的 Floway 版本记录在其
  `vendor/floway` Git submodule 中。

以下命令假设两个仓库位于同一目录：

```text
Projects/
├── Floway/
└── floway-alt-ui/
```

## 替换 Dockerfile

进入两个仓库的上级目录，将替换版复制到 Floway：

```bash
cp floway-alt-ui/Dockerfile Floway/docker/Dockerfile
```

此操作只替换 Dockerfile，不需要复制 Alt UI 源码，也不要覆盖
`Floway/docker/nginx.conf`。

## 构建并启动

进入 Floway 仓库，通过原有 Compose 文件重建服务：

```bash
cd Floway
ADMIN_KEY='<管理密钥>' docker compose -f docker/docker-compose.yml up --build -d
```

默认地址如下：

| 服务 | 地址 |
| --- | --- |
| Floway Alt UI | `http://localhost:18088` |
| Floway 网关 | `http://localhost:8788` |

浏览器应访问 Web 端口 `18088`。Web 容器会把界面发出的同源 API 请求转发给
网关，因此不需要修改 Alt UI 的 `vite.config.ts`。

已有部署使用命名卷 `floway-data` 保存数据库和文件。重新构建 Web 镜像不会
清空该卷，但升级前仍建议按现有运维流程备份数据。

## 固定 Alt UI 版本

Dockerfile 默认构建 Alt UI 的 `main` 分支。生产环境建议在 Compose 中使用
提交 SHA 或 tag 固定版本，避免重建时自动获取到不同代码：

```yaml
services:
  web:
    build:
      context: ..
      dockerfile: docker/Dockerfile
      target: web
      args:
        ALT_UI_REF: "<提交 SHA 或 tag>"
```

也可以覆盖仓库地址，例如使用自己的 fork：

```yaml
      args:
        ALT_UI_REPOSITORY: "https://github.com/example/floway-alt-ui.git"
        ALT_UI_REF: "<提交 SHA 或 tag>"
```

修改后重建 Web 服务：

```bash
ADMIN_KEY='<管理密钥>' docker compose -f docker/docker-compose.yml up --build -d web
```

## 升级

升级 Floway 后，官方可能会修改 `docker/Dockerfile`。请先更新 Floway，再重新
复制本仓库的替换版，并检查 Floway 的 `docker/docker-compose.yml` 和
`docker/nginx.conf` 是否新增了服务、构建参数或代理路径：

```bash
git -C Floway pull --ff-only
cp floway-alt-ui/Dockerfile Floway/docker/Dockerfile
cd Floway
ADMIN_KEY='<管理密钥>' docker compose -f docker/docker-compose.yml up --build -d
```

同时升级 Alt UI 时，应先更新 `ALT_UI_REF`，再执行重建。

## 回滚到 Floway 原界面

在 Floway 仓库恢复官方 Dockerfile，然后只重建 Web 服务：

```bash
git restore docker/Dockerfile
ADMIN_KEY='<管理密钥>' docker compose -f docker/docker-compose.yml up --build -d web
```

该操作不会修改 `floway-data` 数据卷。

## 排查问题

查看服务状态和日志：

```bash
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs --tail=200 web server
```

强制重新获取并构建指定 Alt UI 版本：

```bash
ADMIN_KEY='<管理密钥>' docker compose -f docker/docker-compose.yml build --no-cache web
ADMIN_KEY='<管理密钥>' docker compose -f docker/docker-compose.yml up -d web
```

如果界面可以打开但登录或 API 请求返回 HTML/404，请确认：

1. 使用的是 Floway 自带的 `docker/nginx.conf`；
2. `web` 与 `server` 位于同一个 Compose 网络；
3. `server` 健康检查已通过；
4. Floway 新增的 API 路径已经包含在其 Nginx 代理配置中。

如果 Alt UI 构建阶段无法检出源码，请检查构建主机能否访问
`ALT_UI_REPOSITORY`。私有 fork 还需要为 Docker BuildKit 配置相应的 Git
凭据；直接把访问令牌写入 Dockerfile 或构建参数会泄露到构建记录中，不建议使用。
