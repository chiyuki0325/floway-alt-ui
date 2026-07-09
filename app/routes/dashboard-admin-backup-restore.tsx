import { DashboardPlaceholder } from "../components/dashboard-placeholder";

export function meta() {
  return [{ title: "Backup and Restore | Floway" }];
}

export default function DashboardAdminBackupRestore() {
  return (
    <DashboardPlaceholder
      eyebrowKey="dashboard.groups.admin"
      titleKey="dashboard.nav.backupRestore"
      descriptionKey="dashboard.pages.backupRestore"
      requireAdmin
    />
  );
}
