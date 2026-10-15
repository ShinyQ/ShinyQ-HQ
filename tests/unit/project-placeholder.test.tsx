import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectPlaceholder, projectInitials } from "@/components/page/ProjectPlaceholder";

describe("ProjectPlaceholder", () => {
  it("takes initials from the first two significant words", () => {
    expect(projectInitials("Digital Banking Integrations")).toBe("DB");
    expect(projectInitials("Event Ticket Marketplace Backend")).toBe("ET");
    expect(projectInitials("E-Commerce for Digital Products and Training")).toBe("ED");
    expect(projectInitials("Sentiboard: IndoBERT University Sentiment Dashboard")).toBe("SI");
  });

  it("is decorative, local and wing tinted", () => {
    const html = renderToStaticMarkup(<ProjectPlaceholder id="ph-x" title="Digital Banking Integrations" wing="software" size="row" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-wing="software"');
    expect(html).toContain("data-project-placeholder");
    expect(html).toContain(">DB<");
    expect(html).not.toMatch(/<img|url\((?!#)|https?:/);
  });

  it("gives every placeholder its own gradient ids", () => {
    const a = renderToStaticMarkup(<ProjectPlaceholder id="ph-a" title="Alpha Beta" wing="ai" size="film" />);
    const b = renderToStaticMarkup(<ProjectPlaceholder id="ph-b" title="Alpha Beta" wing="ai" size="film" />);
    expect(a).toContain('id="ph-a-g"');
    expect(b).toContain('id="ph-b-g"');
    expect(a).not.toContain("ph-b");
  });
});
