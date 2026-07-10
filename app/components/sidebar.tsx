import { useState } from "react";
import { NavLink, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowRoutingFilled,
  ArrowRoutingRegular,
  bundleIcon,
  ChatFilled,
  ChatRegular,
  ClipboardTextLtrFilled,
  ClipboardTextLtrRegular,
  DatabaseArrowUpFilled,
  DatabaseArrowUpRegular,
  DataUsageFilled,
  DataUsageRegular,
  DocumentTextFilled,
  DocumentTextRegular,
  GaugeFilled,
  GaugeRegular,
  KeyFilled,
  KeyRegular,
  PeopleFilled,
  PeopleRegular,
  PlugConnectedFilled,
  PlugConnectedRegular,
  SearchFilled,
  SearchRegular,
  SettingsFilled,
  SettingsRegular,
} from "@fluentui/react-icons";
import type { FluentIcon } from "@fluentui/react-icons";

import type { AuthUser } from "../api/auth";
import { fluentComponents } from "../fluent";
import { FlowayLogo } from "./floway-logo";

const { Text } = fluentComponents;

type NavItem = {
  to: string;
  labelKey: string;
  icon: FluentIcon;
  adminOnly?: boolean;
};

type NavGroup = {
  labelKey?: string;
  adminOnly?: boolean;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    items: [
      { to: "/dashboard/playground", labelKey: "dashboard.nav.playground", icon: bundleIcon(ChatFilled, ChatRegular) },
    ],
  },
  {
    labelKey: "dashboard.groups.providers",
    items: [
      { to: "/dashboard/providers/upstreams", labelKey: "dashboard.nav.upstreams", icon: bundleIcon(PlugConnectedFilled, PlugConnectedRegular), adminOnly: true },
      { to: "/dashboard/providers/search", labelKey: "dashboard.nav.search", icon: bundleIcon(SearchFilled, SearchRegular), adminOnly: true },
      { to: "/dashboard/providers/proxy", labelKey: "dashboard.nav.proxy", icon: bundleIcon(ArrowRoutingFilled, ArrowRoutingRegular), adminOnly: true },
    ],
  },
  {
    labelKey: "dashboard.groups.services",
    items: [
      { to: "/dashboard/services/api-keys", labelKey: "dashboard.nav.apiKeys", icon: bundleIcon(KeyFilled, KeyRegular) },
      { to: "/dashboard/services/api-docs", labelKey: "dashboard.nav.apiDocs", icon: bundleIcon(DocumentTextFilled, DocumentTextRegular) },
    ],
  },
  {
    labelKey: "dashboard.groups.monitor",
    items: [
      { to: "/dashboard/monitor/requests", labelKey: "dashboard.nav.requests", icon: bundleIcon(ClipboardTextLtrFilled, ClipboardTextLtrRegular) },
      { to: "/dashboard/monitor/usage", labelKey: "dashboard.nav.usage", icon: bundleIcon(DataUsageFilled, DataUsageRegular) },
      { to: "/dashboard/monitor/performance", labelKey: "dashboard.nav.performance", icon: bundleIcon(GaugeFilled, GaugeRegular) },
    ],
  },
  {
    labelKey: "dashboard.groups.admin",
    adminOnly: true,
    items: [
      { to: "/dashboard/admin/users", labelKey: "dashboard.nav.users", icon: bundleIcon(PeopleFilled, PeopleRegular), adminOnly: true },
      { to: "/dashboard/admin/backup-restore", labelKey: "dashboard.nav.backupRestore", icon: bundleIcon(DatabaseArrowUpFilled, DatabaseArrowUpRegular), adminOnly: true },
    ],
  },
  {
    items: [
      { to: "/dashboard/settings", labelKey: "dashboard.nav.settings", icon: bundleIcon(SettingsFilled, SettingsRegular) },
    ],
  },
];

export function Sidebar({ user }: { user: AuthUser }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <aside
      className="grid grid-rows-[auto_minmax(0,1fr)] h-screen min-h-0 overflow-hidden p-[22px_16px_18px]"
      aria-label={t("dashboard.nav.label")}
    >
      <div className="flex items-center min-h-[48px] px-[10px] pb-[17px]">
        <FlowayLogo size="compact" />
      </div>
      <nav className="h-full min-h-0 overflow-x-hidden overflow-y-auto p-[2px_4px_14px] [scrollbar-gutter:stable]">
        {navGroups.map((group, groupIndex) => {
          if (group.adminOnly && !user.isAdmin) return null;

          const items = group.items.filter(
            (item) => !item.adminOnly || user.isAdmin,
          );
          if (!items.length) return null;

          return (
            <section className="grid gap-[5px] mb-[17px] last:mb-0" key={group.labelKey ?? groupIndex}>
              {group.labelKey && (
                <Text
                  size={200}
                  weight="semibold"
                  className="!text-fui-fg3 !leading-[1.2] block p-[7px_14px_3px]"
                >
                  {t(group.labelKey)}
                </Text>
              )}
              <div className="grid gap-[2px]">
                {items.map((item) => (
                  <SidebarNavLink currentPath={pathname} item={item} key={item.to} />
                ))}
              </div>
            </section>
          );
        })}
      </nav>
    </aside>
  );
}

function SidebarNavLink({
  currentPath,
  item,
}: {
  currentPath: string;
  item: NavItem;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const Icon = item.icon;
  const active = currentPath === item.to || currentPath.startsWith(`${item.to}/`);
  const showFilled = hovered;

  return (
    <NavLink
      aria-current={active ? "page" : undefined}
      className={({ isPending }) =>
        [
          "relative grid grid-cols-[4px_20px_minmax(0,1fr)] items-center gap-2 rounded-lg text-fui-base300 font-fui-medium min-h-[38px] px-3 pl-2 no-underline",
          "focus-visible:[outline:2px_solid_#0f6cbd] focus-visible:outline-offset-2",
          active
            ? "text-fui-nav-active bg-fui-nav-active shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
            : "text-fui-nav-default hover:text-fui-nav-hover hover:bg-fui-nav-hover",
          isPending ? "opacity-72" : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      to={item.to}
    >
      <span
        className={`block rounded-full h-[18px] w-[3px] ${active ? "bg-[#0f6cbd]" : "bg-transparent"}`}
        aria-hidden="true"
      />
      <span className="relative h-5 w-5">
        <Icon
          className="absolute inset-0 text-current text-xl h-5 w-5 transition-opacity duration-200"
          filled={false}
          style={{ opacity: showFilled ? 0 : 1 }}
        />
        <Icon
          className="absolute inset-0 text-current text-xl h-5 w-5 transition-opacity duration-200"
          filled={true}
          style={{ opacity: showFilled ? 1 : 0 }}
        />
      </span>
      <Text truncate wrap={false}>
        {t(item.labelKey)}
      </Text>
    </NavLink>
  );
}
