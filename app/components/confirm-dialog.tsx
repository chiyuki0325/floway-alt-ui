import { useTranslation } from "react-i18next";

import { fluentComponents } from "../fluent";
import styles from "./confirm-dialog.module.css";

const {
  Button,
  Dialog,
  DialogSurface,
  DialogTitle,
} = fluentComponents;

export function ConfirmDialog({
  actionLabel,
  cancelLabel,
  message,
  onConfirm,
  onOpenChange,
  open,
  title,
}: {
  actionLabel: string;
  cancelLabel?: string;
  message: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
      <DialogSurface className={styles.surface}>
        <div className={styles.body}>
          <DialogTitle as="h2" className={styles.title}>
            {title}
          </DialogTitle>
          <p className={styles.message}>{message}</p>
        </div>
        <footer className={styles.actions}>
          <Button
            appearance="primary"
            className={styles.actionButton}
            onClick={onConfirm}
          >
            {actionLabel}
          </Button>
          <Button
            className={styles.actionButton}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel ?? t("common.cancel")}
          </Button>
        </footer>
      </DialogSurface>
    </Dialog>
  );
}
