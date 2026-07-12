import type { Config } from "@react-router/dev/config";

export default {
  ssr: false,
  // Keep each lazy route self-contained instead of emitting separate chunks for
  // its component, client loader, and client action exports.
  splitRouteModules: false,
} satisfies Config;
