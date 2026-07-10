import { fluentComponents } from "../fluent";

const { makeStyles } = fluentComponents;

// makeStyles types are overly strict for CSS features like light-dark().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useMarkStyles = makeStyles({
  root: {
    alignItems: "center",
    background: "light-dark(#b3cf73, #204c25)",
    border: "1px solid light-dark(#5a9c46, #367029)",
    borderRadius: "6px",
    boxShadow: "none",
    display: "inline-flex",
    fontSize: "20px",
    height: "28px",
    justifyContent: "center",
    lineHeight: 1,
    width: "28px",
  } as any,
  compact: {
    fontSize: "22px",
    height: "36px",
    width: "36px",
  } as any,
});

interface FlowayLogoProps {
  size?: "default" | "compact";
  className?: string;
}

export function FlowayLogo({ size = "default", className }: FlowayLogoProps) {
  const compact = size === "compact";
  const ms = useMarkStyles();

  return (
    <div
      className={[
        "inline-flex items-center min-w-0 text-fui-fg2",
        compact ? "gap-2.5" : "gap-2",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={`${ms.root} ${compact ? ms.compact : ""}`}
        aria-hidden="true"
      >
        🥦
      </span>
      <span
        className={`font-semibold leading-none tracking-normal ${compact ? "text-lg max-[520px]:text-xl" : "text-xl"}`}
      >
        Floway
      </span>
    </div>
  );
}
