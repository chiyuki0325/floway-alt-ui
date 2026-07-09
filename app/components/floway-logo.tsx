import styles from "./floway-logo.module.css";

interface FlowayLogoProps {
  size?: "default" | "compact";
  className?: string;
}

export function FlowayLogo({ size = "default", className }: FlowayLogoProps) {
  const compact = size === "compact";

  return (
    <div
      className={[
        styles.logo,
        compact ? styles.compact : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={`${styles.mark} floway-logo-mark`} aria-hidden="true">
        🥦
      </span>
      <span className={styles.wordmark}>Floway</span>
    </div>
  );
}
