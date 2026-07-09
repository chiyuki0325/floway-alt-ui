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
