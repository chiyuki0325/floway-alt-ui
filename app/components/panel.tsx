import type { CardProps } from "@fluentui/react-components";
import { fluentComponents } from "../fluent";

const { Card } = fluentComponents;

export function Panel({ className, ...props }: CardProps) {
  return <Card {...props} className={`!rounded-lg ${className ?? ""}`} />;
}
