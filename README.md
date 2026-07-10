# Floway Alt UI

[Floway](https://github.com/Menci/Floway) 的实验性替代前端，采用 Azure 控制面板风格设计。

## 技术栈

- **框架**：React 19 + React Router 8（Framework Mode）
- **构建**：Vite 8
- **UI 组件**：Fluent UI React v9
- **样式**：UnoCSS（presetWind3）
- **表单**：react-hook-form + zod
- **国际化**：react-i18next
- **包管理**：pnpm

## 快速开始

```bash
# 初始化并安装依赖（首次克隆后执行）
pnpm setup

# 启动开发服务器
pnpm dev
```

开发服务器默认运行在 `http://localhost:5173`。

## 接入后端

开发环境下，前端通过 Vite 代理将 API 请求转发到 Floway 后端。编辑 `vite.config.ts`，将 `server.proxy` 中所有路径的 `target` 替换为你的 Floway 网关地址：

```ts
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      "/auth": {
        target: "http://your-floway-gateway:8788",  // ← 替换为你的后端地址
        changeOrigin: true,
        secure: true,
      },
      "/api": {
        target: "http://your-floway-gateway:8788",  // ← 同上
        changeOrigin: true,
        secure: true,
      },
      "/v1": {
        target: "http://your-floway-gateway:8788",
        changeOrigin: true,
        secure: true,
      },
      "/anthropic": {
        target: "http://your-floway-gateway:8788",
        changeOrigin: true,
        secure: true,
      },
      "/gemini": {
        target: "http://your-floway-gateway:8788",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
```

代理路径说明：

| 路径 | 用途 |
|------|------|
| `/auth` | 认证接口（登录/登出/会话） |
| `/api` | 控制台管理接口 |
| `/v1` | LLM API 代理（OpenAI 兼容） |
| `/anthropic` | LLM API 代理（Anthropic 兼容） |
| `/gemini` | LLM API 代理（Gemini 兼容） |

## 构建与部署

```bash
# 类型检查
pnpm typecheck

# 生产构建
pnpm build

# 启动生产服务
pnpm start
```

## 项目结构

```
app/
├── routes/          # 路由模块（页面）
├── components/      # 可复用组件
├── api/             # API 客户端与类型
├── fluent.ts        # Fluent UI 统一导出
├── root.tsx         # 根布局
└── routes.ts        # 路由配置
```

## 相关链接

- [Floway](https://github.com/Menci/Floway) — 上游项目
- [Fluent UI React v9](https://react.fluentui.dev/) — 组件库文档
