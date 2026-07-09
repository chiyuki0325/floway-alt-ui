import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const defaultLanguage = "en";
export const supportedLanguages = ["en", "zh"] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export const resources = {
  en: {
    translation: {
      common: {
        language: "Language",
        english: "English",
        chinese: "中文",
        loading: "Loading...",
      },
      auth: {
        adminKeyHint:
          "Leave username blank to sign in as admin (using <adminKey>ADMIN_KEY</adminKey>).",
        login: {
          title: "Sign in",
          subtitle: "Sign in to Floway.",
          username: "Username",
          usernamePlaceholder: "Username",
          password: "Password",
          passwordPlaceholder: "Enter your password",
          submit: "Sign in",
          submitting: "Signing in...",
          genericError: "Unable to sign in. Check the gateway and try again.",
        },
      },
      dashboard: {
        groups: {
          console: "Console",
          providers: "Providers",
          services: "Services",
          monitor: "Monitor",
          admin: "Management",
        },
        nav: {
          label: "Dashboard navigation",
          playground: "Playground",
          upstreams: "Upstreams",
          search: "Search",
          proxy: "Proxy",
          apiKeys: "API Keys",
          apiDocs: "API Docs",
          requests: "Requests",
          usage: "Usage",
          performance: "Performance",
          users: "Users",
          backupRestore: "Backup / Restore",
          settings: "Settings",
        },
        pages: {
          playground:
            "Run model conversations and inspect request behavior from the control plane.",
          upstreams:
            "Review provider upstreams and connection settings. Operators can view this area in read-only mode.",
          search:
            "Search provider capabilities and imported model metadata across global upstreams.",
          proxy:
            "Manage proxy routing, transport, and gateway-level proxy configuration.",
          apiKeys:
            "Create and manage API keys used by clients that call Floway.",
          apiDocs:
            "Read API references and integration guidance for the Floway gateway.",
          requests:
            "Inspect request records, status, routing results, and error details.",
          usage:
            "Track token usage and traffic volume across users, keys, models, and upstreams.",
          performance:
            "Monitor latency, throughput, and upstream performance signals.",
          users:
            "Manage console users, permissions, telemetry access, and upstream scopes.",
          backupRestore:
            "Export or restore gateway configuration and control plane data.",
          readonly: "Signed in as an operator. This area is read-only.",
          adminOnly: "Administrator access required.",
          adminOnlyDescription:
            "This route is reserved for admin users and is hidden from the sidebar for operators.",
        },
        settings: {
          title: "Settings",
          heading: "Floway settings",
          intro:
            "You are signed in. The settings console will be rebuilt here next.",
          signedInAs: "Signed in as {{username}}",
          admin: "Admin",
          operator: "Operator",
          telemetryAllowed: "Global telemetry access enabled",
          telemetryScoped: "Telemetry is scoped to this user",
        },
      },
      validation: {
        passwordRequired: "Enter a password to continue.",
        passwordMax: "Password must be 1024 characters or fewer.",
        usernamePattern:
          "Username must be 0-64 characters using letters, numbers, underscore, dot, or hyphen.",
      },
    },
  },
  zh: {
    translation: {
      common: {
        language: "语言",
        english: "English",
        chinese: "中文",
        loading: "加载中...",
      },
      auth: {
        adminKeyHint:
          "用户名留空即可以管理员身份登录（使用 <adminKey>ADMIN_KEY</adminKey>）。",
        login: {
          title: "登录",
          subtitle: "登录到 Floway。",
          username: "用户名",
          usernamePlaceholder: "用户名",
          password: "密码",
          passwordPlaceholder: "输入密码",
          submit: "登录",
          submitting: "正在登录...",
          genericError: "无法登录。请检查 gateway 后重试。",
        },
      },
      dashboard: {
        groups: {
          console: "控制台",
          providers: "接入",
          services: "服务",
          monitor: "监控",
          admin: "管理",
        },
        nav: {
          label: "Dashboard 导航",
          playground: "对话",
          upstreams: "上游",
          search: "搜索",
          proxy: "代理",
          apiKeys: "API 密钥",
          apiDocs: "API 文档",
          requests: "请求记录",
          usage: "使用量",
          performance: "性能",
          users: "用户",
          backupRestore: "备份/恢复",
          settings: "设置",
        },
        pages: {
          playground: "在控制台中运行模型对话，并检查请求行为。",
          upstreams: "查看 provider 上游和连接配置。普通用户在这里以只读方式访问。",
          search: "在全局上游中搜索 provider 能力和已导入的模型元数据。",
          proxy: "管理代理路由、传输方式和 gateway 级代理配置。",
          apiKeys: "创建和管理客户端调用 Floway 时使用的 API key。",
          apiDocs: "阅读 Floway gateway 的 API 参考和接入说明。",
          requests: "查看请求记录、状态、路由结果和错误详情。",
          usage: "按用户、密钥、模型和上游查看 token 用量与流量。",
          performance: "观察延迟、吞吐和上游性能信号。",
          users: "管理控制台用户、权限、观测访问和上游范围。",
          backupRestore: "导出或恢复 gateway 配置和控制平面数据。",
          readonly: "当前是普通用户身份，此区域为只读。",
          adminOnly: "需要管理员权限。",
          adminOnlyDescription:
            "该路由仅管理员可用，并且会对普通用户从侧边栏隐藏。",
        },
        settings: {
          title: "设置",
          heading: "Floway 设置",
          intro: "你已登录。设置控制台后续会在这里重建。",
          signedInAs: "当前用户：{{username}}",
          admin: "管理员",
          operator: "操作员",
          telemetryAllowed: "已启用全局观测权限",
          telemetryScoped: "观测范围限定为当前用户",
        },
      },
      validation: {
        passwordRequired: "请输入密码后继续。",
        passwordMax: "密码不能超过 1024 个字符。",
        usernamePattern:
          "用户名必须为 0-64 个字符，只能包含字母、数字、下划线、点或连字符。",
      },
    },
  },
} as const;

const isSupportedLanguage = (value: string): value is SupportedLanguage =>
  supportedLanguages.includes(value as SupportedLanguage);

export const normalizeLanguage = (value: string | null | undefined) => {
  if (!value) return null;
  const language = value.toLowerCase();
  if (language.startsWith("zh")) return "zh";
  if (language.startsWith("en")) return "en";
  return isSupportedLanguage(language) ? language : null;
};

void i18n.use(initReactI18next).init({
  resources,
  lng: defaultLanguage,
  fallbackLng: defaultLanguage,
  interpolation: {
    escapeValue: false,
  },
});

void i18n.on("languageChanged", (language) => {
  if (typeof window !== "undefined") {
    const normalized = normalizeLanguage(language) ?? defaultLanguage;
    window.document.documentElement.lang = normalized === "zh" ? "zh-CN" : "en";
  }
});

export { i18n };
