import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("dashboard/settings", "routes/dashboard-settings.tsx"),
] satisfies RouteConfig;
