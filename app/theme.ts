import { fluentComponents } from "./fluent";

const { webDarkTheme, webLightTheme } = fluentComponents;

const fontOverrides = {
  fontFamilyBase: "sans-serif",
  fontFamilyMonospace: "monospace",
  fontFamilyNumeric: "sans-serif",
  fontSizeBase100: "10px",
  fontSizeBase200: "12px",
  fontSizeBase300: "14px",
  fontSizeBase400: "16px",
  fontSizeBase500: "18px",
  fontSizeBase600: "22px",
} as const;

export const flowayLightTheme = { ...webLightTheme, ...fontOverrides };
export const flowayDarkTheme = { ...webDarkTheme, ...fontOverrides };

/** @deprecated use flowayLightTheme or flowayDarkTheme instead */
export const flowayTheme = flowayLightTheme;
