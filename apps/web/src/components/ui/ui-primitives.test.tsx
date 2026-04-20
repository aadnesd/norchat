import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Input } from "./input";
import { Select } from "./select";
import { Textarea } from "./textarea";
import { Badge } from "./badge";

describe("ui primitives", () => {
  it("renders input props", () => {
    const html = renderToStaticMarkup(
      <Input placeholder="Workspace" defaultValue="Nordic Care" />
    );

    expect(html).toContain("placeholder=\"Workspace\"");
    expect(html).toContain("value=\"Nordic Care\"");
  });

  it("renders textarea props", () => {
    const html = renderToStaticMarkup(
      <Textarea rows={3} defaultValue="Knowledge snippet" />
    );

    expect(html).toContain("rows=\"3\"");
    expect(html).toContain("Knowledge snippet");
  });

  it("renders select options", () => {
    const html = renderToStaticMarkup(
      <Select defaultValue="help_page">
        <option value="web_widget">Web widget</option>
        <option value="help_page">Help page</option>
      </Select>
    );

    expect(html).toContain("<select");
    expect(html).toContain("Web widget");
    expect(html).toContain("Help page");
  });

  it("renders badge variants", () => {
    const html = renderToStaticMarkup(
      <Badge variant="secondary">Step 1 of 4</Badge>
    );

    expect(html).toContain("bg-[var(--surface-sunken)]");
    expect(html).toContain("Step 1 of 4");
  });
});
