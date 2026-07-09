import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { BrowserLanguageSync } from "./components/browser-language-sync";
import { DocumentTitleSync } from "./components/document-title-sync";
import { GradientBackground } from "./components/gradient-background";
import { fluentComponents } from "./fluent";
import { flowayTheme } from "./theme";
import "./i18n";
import "./app.css";

const { FluentProvider } = fluentComponents;

export const links: Route.LinksFunction = () => [];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <FluentProvider theme={flowayTheme}>
          <BrowserLanguageSync />
          <GradientBackground>{children}</GradientBackground>
        </FluentProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <>
      <DocumentTitleSync />
      <Outlet />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="floway-error-shell">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="floway-error-stack">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
