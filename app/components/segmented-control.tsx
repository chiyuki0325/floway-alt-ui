import styles from "./segmented-control.module.css";

export interface SegmentedControlItem {
  value: string;
  label: string;
}

export function SegmentedControl({
  ariaLabel,
  items,
  onChange,
  value,
}: {
  ariaLabel: string;
  items: SegmentedControlItem[];
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div aria-label={ariaLabel} className={styles.segmented} role="tablist">
      {items.map((item) => (
        <button
          aria-selected={value === item.value}
          className={value === item.value ? styles.active : ""}
          key={item.value}
          onClick={() => onChange(item.value)}
          role="tab"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
