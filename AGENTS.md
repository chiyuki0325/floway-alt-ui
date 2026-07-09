# AGENTS.md

## 项目定位

本仓库是 Floway 的替代前端实验仓库。目标是用当前仓库的 React
Router + React 技术栈，逐步重建 `/home/chiyuki/Projects/Floway/apps/web`
现有 Vue 前端的关键管理能力，而不是一次性照搬旧实现。

Floway 是 LLM API gateway。前端主要服务于控制台能力：登录、上游配置、
模型查看/API key 管理、用户管理、请求/用量/性能观测、导入导出等。后端、
协议类型和控制平面接口目前仍以 `/home/chiyuki/Projects/Floway` 为准。

## 当前技术栈

- 包管理器：优先使用 `pnpm`，本仓库已有 `pnpm-lock.yaml`。
- 应用框架：React 19 + React Router 8 Framework Mode。
- 构建工具：Vite 8。
- UI 组件：`@fluentui/react-components`。
- 样式：Tailwind CSS 4，经 `@tailwindcss/vite` 接入，主要用于布局和局部样式。
- 表单/校验：`react-hook-form`、`@hookform/resolvers`、`zod`。
- 国际化：`react-i18next`，Zod 错误文案使用 `zod-i18n-map`。
- 图标：`@fluentui/react-icons`，新增图标优先从这里选。

## 常用命令

在本仓库根目录运行：

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
pnpm start
```

`pnpm dev` 启动 React Router 开发服务器，默认入口通常是
`http://localhost:5173`。`pnpm typecheck` 会先运行
`react-router typegen`，不要手动编辑生成的 `.react-router` 类型文件。

## 需要参考的原项目位置

- 原前端：`/home/chiyuki/Projects/Floway/apps/web`
- 原前端 API 封装：`apps/web/src/api/client.ts`
- 原前端 DTO 类型：`apps/web/src/api/types.ts`
- 原前端登录状态：`apps/web/src/stores/auth.ts`
- 原前端页面：`apps/web/src/pages`
- 原前端组件：`apps/web/src/components`
- 后端 Hono App 类型导出：`/home/chiyuki/Projects/Floway/packages/gateway`
- 协议和公共模型类型：`/home/chiyuki/Projects/Floway/packages/protocols`
- Provider 公共类型：`/home/chiyuki/Projects/Floway/packages/provider`
- Proxy URL/配置工具：`/home/chiyuki/Projects/Floway/packages/proxy`

调研旧前端时，以行为和数据契约为主，不要机械翻译 Vue 组件结构。旧前端可作为
功能清单、接口用法和边界条件来源。

## 开发原则

- 不要过早定义完整路由、导航结构或页面层级。先按当前任务实现必要路径，等功能
  形态稳定后再收敛信息架构。
- 优先迁移真实用户流程，而不是复刻旧前端的文件布局。
- 与后端交互时，尽量复用 Floway 现有控制平面 DTO、Hono RPC 类型和公共协议类型；
  避免在前端重新发明相似但不兼容的类型。
- 认证会话沿用 Floway 语义：请求带 `x-floway-session`，401 后清理本地会话。
- API key、upstream、model、user、usage、performance 等业务词保持和 Floway 后端一致。
- 项目名在 prose 中写作 `Floway`。只有包名、环境变量、header、storage key 等既有
  技术标识中才使用小写 `floway`。
- 这个仓库是替代前端，不要修改 `/home/chiyuki/Projects/Floway`，除非用户明确要求。

## React Router 约定

本仓库是 React Router Framework Mode：

- 路由配置入口是 `app/routes.ts`。
- 根布局和全局文档结构在 `app/root.tsx`。
- route module 放在 `app/routes/` 下。
- route module 类型从对应的 `./+types/...` 做 type-only import。
- 页面级数据优先使用 React Router 的 `loader` / `action`，不要默认用
  `useEffect` 拉取路由数据。

保持路由配置小而明确。新增页面时只添加当前功能需要的 route，不要预留一整套尚未
实现的 dashboard 路由。

## UI 方向

Floway 控制台是运维/配置型工具，界面应当紧凑、清晰、适合反复操作：

- 优先做可用的工作台界面，不做营销落地页。
- 优先使用 Fluent UI React Components 里的 Button、Input、Field、Select、
  Checkbox、Switch、Dialog、Menu、Tab、Table 等基础组件承载可访问性、焦点管理和
  交互状态。只有项目确实需要 Fluent UI 未覆盖的形态时，再写轻量自定义组件。
- 表单状态优先使用 React Hook Form 管理，校验 schema 优先使用 Zod，并把错误展示接到
  Fluent UI 的 Field/Message 等语义组件上。不要为普通表单手写一套分散的
  `useState` 校验状态。
- 本仓库配置了 project-scope `fluentui` MCP server：Codex 使用 `.codex/config.toml`，
  Claude Code 使用 `.mcp.json`。涉及 Fluent UI 组件 API、组合方式或无障碍行为时，
  优先查询该 MCP 的 v9 文档。
- 控件语义要明确：表单用标准输入控件，二元状态用 checkbox/switch，枚举用 select
  或 tabs/segmented control，危险操作要有确认。
- 不嵌套卡片；表格、列表、编辑面板保持信息密度。
- 避免大面积单色渐变、装饰性背景和无关插图。
- 移动端和窄屏上文字不能溢出按钮、标签或表格单元。

## UI 字符串与国际化

- 新增用户可见文案时默认走 `react-i18next`，不要把完整句子、按钮文案、表单标签、
  placeholder、toast、空状态、确认弹窗或错误提示散落硬编码在组件里。
- 可以保留业务协议值、模型 id、provider kind、API path、header 名、环境变量名、
  storage key、测试 fixture 等技术标识为原文；这些不是 UI 翻译文案。
- Zod schema 不要写固定英文错误句子。优先用 error code、字段路径和
  `zod-i18n-map` 生成本地化校验文案；确需自定义错误时，也应通过 i18n key 表达。
- i18n key 应按功能语义命名，避免用整句英文当 key，方便后续调整文案而不破坏调用点。
- 迁移旧 Vue 前端文案时，可以先保留原英文语义，但落点应是翻译资源或集中常量，而不是
  分散 JSX 字符串。不要为了“完整国际化”提前大规模铺设尚未使用的命名空间。

## 与原 Floway 的接口边界

旧前端通过 Hono client 调用相对路径 `/` 下的后端接口，并将 session token 写入
`x-floway-session`。替代前端也应保持这一边界，方便在开发和部署时由代理或同源
服务接到同一个 Floway gateway。

需要类型时，优先从原 Floway 包中确认真实导出。如果本仓库尚未配置 workspace
依赖，可以先在本仓库内定义窄 DTO，但必须注明它对应的后端接口，并在后续接入真实
包导出时删除重复类型。

## 验证要求

完成代码改动前至少运行与改动相关的命令：

```bash
pnpm typecheck
pnpm build
```

如果只是文档改动，可以不运行构建，但需要确认 Markdown 内容与当前仓库实际命令和
依赖一致。
