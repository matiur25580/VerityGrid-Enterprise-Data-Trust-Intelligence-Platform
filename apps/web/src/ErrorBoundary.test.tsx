import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorBoundary } from "./ErrorBoundary";

describe("ErrorBoundary", () => {
  it("transitions to its fallback state after a descendant render error", () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true });
  });

  it("renders a safe, actionable fallback without exposing exception details", () => {
    const boundary = new ErrorBoundary({ children: createElement("div", null, "Workspace") });
    boundary.state = { hasError: true };

    const html = renderToStaticMarkup(boundary.render());

    expect(html).toContain("The workspace needs to reload");
    expect(html).toContain("Reload workspace");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("password");
    expect(html).not.toContain("stack");
  });

  it("renders its child tree when no error has occurred", () => {
    const boundary = new ErrorBoundary({ children: createElement("div", null, "Workspace ready") });

    expect(renderToStaticMarkup(boundary.render())).toContain("Workspace ready");
  });
});
