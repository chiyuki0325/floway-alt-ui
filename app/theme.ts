import { fluentComponents } from "./fluent";

const { webLightTheme } = fluentComponents;

const sansFontFamily = "sans-serif";
const monoFontFamily = "monospace";

export const flowayTheme = {
  ...webLightTheme,
  fontFamilyBase: sansFontFamily,
  fontFamilyMonospace: monoFontFamily,
  fontFamilyNumeric: sansFontFamily,
  fontSizeBase100: "10px",
  fontSizeBase200: "12px",
  fontSizeBase300: "14px",
  fontSizeBase400: "16px",
  fontSizeBase500: "18px",
  fontSizeBase600: "22px",
};
