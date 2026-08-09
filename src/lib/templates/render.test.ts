import { describe, expect, it } from "vitest";

import { renderEmailTemplates, type TemplateContext, validateTemplateVariables } from "./render";

const context: TemplateContext = {
  NAME: "Rose City Glam",
  EMAIL: "rose@example.com",
  LINK: "https://example.com/rose",
  BUSINESS_TYPE: "Makeup Artists",
  CITY: "Portland",
  GUIDE_TITLE: "Best Makeup Artists",
  AUDIENCE: "brides and event attendees",
  SERVICES: "bridal and event makeup",
};

describe("template rendering", () => {
  it("replaces every supported variable deterministically", () => {
    const result = renderEmailTemplates(
      "{{NAME}} — {{CITY}} — {{GUIDE_TITLE}}",
      "{{EMAIL}}\n{{LINK}}\n{{BUSINESS_TYPE}}\n{{AUDIENCE}}\n{{SERVICES}}",
      context,
    );

    expect(result.subject).toBe("Rose City Glam — Portland — Best Makeup Artists");
    expect(result.body).toContain("rose@example.com");
    expect(result.body).not.toContain("{{");
  });

  it("rejects unsupported variables", () => {
    expect(validateTemplateVariables("Hello {{NAME}} {{UNKNOWN}}"))
      .toEqual(["UNKNOWN"]);
    expect(() => renderEmailTemplates("{{UNKNOWN}}", "Body", context)).toThrow("Unsupported");
    expect(validateTemplateVariables("Hello {{name}}"))
      .toEqual(["name"]);
  });

  it("removes line breaks from variable values before subject interpolation", () => {
    const result = renderEmailTemplates("Hello {{NAME}}", "Body", {
      ...context,
      NAME: "Rose\r\nBcc: hidden@example.com",
    });
    expect(result.subject).toBe("Hello Rose Bcc: hidden@example.com");
  });
});
