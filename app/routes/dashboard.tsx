import {
  Outlet,
  NavLink,
  redirect,
  useNavigate,
  useLocation,
  useOutletContext,
} from "react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowRoutingRegular,
  ChatRegular,
  ClipboardTextLtrRegular,
  DatabaseArrowUpRegular,
  DataUsageRegular,
  DocumentTextRegular,
  GaugeRegular,
  KeyRegular,
  PeopleRegular,
  PlugConnectedRegular,
  SearchRegular,
  SettingsRegular,
} from "@fluentui/react-icons";
import { useEffect, type ComponentType } from "react";

import type { Route } from "./+types/dashboard";
import type { AuthUser } from "../api/auth";
import { getSessionToken } from "../auth/session";
import { FlowayLogo } from "../components/floway-logo";
import { fluentComponents } from "../fluent";
import { useAuthStore } from "../stores/auth-store";
import styles from "./dashboard.module.css";

const { Spinner } = fluentComponents;

export type DashboardOutletContext = {
  user: AuthUser;
};

type IconComponent = ComponentType<{ className?: string }>;

type NavItem = {
  to: string;
  labelKey: string;
  icon: IconComponent;
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
      {
        to: "/dashboard/playground",
        labelKey: "dashboard.nav.playground",
        icon: ChatRegular,
      },
    ],
  },
  {
    labelKey: "dashboard.groups.providers",
    items: [
      {
        to: "/dashboard/providers/upstreams",
        labelKey: "dashboard.nav.upstreams",
        icon: PlugConnectedRegular,
      },
      {
        to: "/dashboard/providers/search",
        labelKey: "dashboard.nav.search",
        icon: SearchRegular,
        adminOnly: true,
      },
      {
        to: "/dashboard/providers/proxy",
        labelKey: "dashboard.nav.proxy",
        icon: ArrowRoutingRegular,
        adminOnly: true,
      },
    ],
  },
  {
    labelKey: "dashboard.groups.services",
    items: [
      {
        to: "/dashboard/services/api-keys",
        labelKey: "dashboard.nav.apiKeys",
        icon: KeyRegular,
      },
      {
        to: "/dashboard/services/api-docs",
        labelKey: "dashboard.nav.apiDocs",
        icon: DocumentTextRegular,
      },
    ],
  },
  {
    labelKey: "dashboard.groups.monitor",
    items: [
      {
        to: "/dashboard/monitor/requests",
        labelKey: "dashboard.nav.requests",
        icon: ClipboardTextLtrRegular,
      },
      {
        to: "/dashboard/monitor/usage",
        labelKey: "dashboard.nav.usage",
        icon: DataUsageRegular,
      },
      {
        to: "/dashboard/monitor/performance",
        labelKey: "dashboard.nav.performance",
        icon: GaugeRegular,
      },
    ],
  },
  {
    labelKey: "dashboard.groups.admin",
    adminOnly: true,
    items: [
      {
        to: "/dashboard/admin/users",
        labelKey: "dashboard.nav.users",
        icon: PeopleRegular,
        adminOnly: true,
      },
      {
        to: "/dashboard/admin/backup-restore",
        labelKey: "dashboard.nav.backupRestore",
        icon: DatabaseArrowUpRegular,
        adminOnly: true,
      },
    ],
  },
  {
    items: [
      {
        to: "/dashboard/settings",
        labelKey: "dashboard.nav.settings",
        icon: SettingsRegular,
      },
    ],
  },
];

export async function clientLoader() {
  if (!getSessionToken()) throw redirect("/");
  return null;
}

clientLoader.hydrate = true as const;

export function HydrateFallback() {
  const { t } = useTranslation();

  return (
    <main className="floway-page-shell floway-page-shell--centered">
      <Spinner label={t("common.loading")} />
    </main>
  );
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Dashboard | Floway" }];
}

export default function Dashboard({}: Route.ComponentProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const initialize = useAuthStore((state) => state.initialize);
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const error = useAuthStore((state) => state.error);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (status === "unauthenticated") navigate("/", { replace: true });
  }, [navigate, status]);

  if (status === "error") {
    return (
      <main className="floway-page-shell floway-page-shell--centered">
        <p className="floway-loading">{error}</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="floway-page-shell floway-page-shell--centered">
        <Spinner label={t("common.loading")} />
      </main>
    );
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label={t("dashboard.nav.label")}>
        <div className={styles.logoSlot}>
          <FlowayLogo size="compact" />
        </div>
        <nav className={styles.navScroller}>
          {navGroups.map((group, groupIndex) => {
            if (group.adminOnly && !user.isAdmin) return null;

            const items = group.items.filter(
              (item) => !item.adminOnly || user.isAdmin,
            );
            if (!items.length) return null;

            return (
              <section className={styles.navGroup} key={group.labelKey ?? groupIndex}>
                {group.labelKey && (
                  <h2 className={styles.groupHeading}>{t(group.labelKey)}</h2>
                )}
                <div className={styles.navItems}>
                  {items.map((item) => (
                    <DashboardNavLink
                      currentPath={location.pathname}
                      item={item}
                      key={item.to}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </nav>
      </aside>
      <main className={styles.content}>
        <Outlet context={{ user } satisfies DashboardOutletContext} />
      </main>
    </div>
  );
}

function DashboardNavLink({
  currentPath,
  item,
}: {
  currentPath: string;
  item: NavItem;
}) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const active = currentPath === item.to;

  return (
    <NavLink
      aria-current={active ? "page" : undefined}
      className={({ isPending }) =>
        [
          styles.navLink,
          active ? styles.active : "",
          isPending ? styles.pending : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
      to={item.to}
    >
      <span className={styles.activeRail} aria-hidden="true" />
      <Icon className={styles.navIcon} />
      <span className={styles.navLabel}>{t(item.labelKey)}</span>
    </NavLink>
  );
}

export function useDashboardOutletContext() {
  return useOutletContext<DashboardOutletContext>();
}
