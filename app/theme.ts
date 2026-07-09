import { fluentComponents } from "./fluent";

const { webLightTheme } = fluentComponents;

const sansFontFamily = "sans-serif";
const monoFontFamily = "monospace";

export const flowayTheme = {
  ...webLightTheme,
  fontFamilyBase: sansFontFamily,
  fontFamilyMonospace: monoFontFamily,
  fontFamilyNumeric: sansFontFamily,
};
