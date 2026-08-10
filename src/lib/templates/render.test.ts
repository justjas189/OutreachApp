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

  it("preserves formatting around variables and escapes HTML values", () => {
    const result = renderEmailTemplates("Hello {{NAME}}", "fallback", {
      ...context,
      NAME: '<img src=x onerror="alert(1)"> Rose & Co',
    }, '<p><strong>{{NAME}}</strong> <em>{{GUIDE_TITLE}}</em> <u>{{CITY}}</u></p>');
    expect(result.body_html).toContain('<strong>&lt;img src=x onerror="alert(1)"&gt; Rose &amp; Co</strong>');
    expect(result.body_html).toContain("<em>Best Makeup Artists</em>");
    expect(result.body_html).toContain("<u>Portland</u>");
    expect(result.body_html).not.toContain("<img");
  });

  it("allows safe variable links and removes unsafe rendered links", () => {
    expect(renderEmailTemplates("Subject", "fallback", context, '<p><a href="{{LINK}}">Guide</a></p>').body_html)
      .toContain('href="https://example.com/rose"');
    expect(renderEmailTemplates("Subject", "fallback", { ...context, LINK: "javascript:alert(1)" }, '<p><a href="{{LINK}}">Guide</a></p>').body_html)
      .toBe("<p><a>Guide</a></p>");
  });
});
