import * as fluentNamespace from "@fluentui/react-components";

type FluentComponents = typeof import("@fluentui/react-components");
type FluentComponentsInterop = Partial<FluentComponents> & {
  default?: Partial<FluentComponents>;
  "module.exports"?: Partial<FluentComponents>;
};

const wrappedNamespace = fluentNamespace as unknown as FluentComponentsInterop;

export const fluentComponents = (
  wrappedNamespace.FluentProvider
    ? wrappedNamespace
    : wrappedNamespace.default ?? wrappedNamespace["module.exports"]
) as FluentComponents;
