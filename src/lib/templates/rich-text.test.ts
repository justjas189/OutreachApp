import { describe, expect, it } from "vitest";

import { htmlToPlainText, normalizeRichTemplate, plainTextToHtml, sanitizeRichHtml } from "./rich-text";

describe("rich template security and compatibility", () => {
  it("preserves supported formatting, lists, and safe links", () => {
    const html = sanitizeRichHtml('<p><strong>Bold</strong> <em>Italic</em> <u>Under</u></p><ul><li>One</li></ul><ol><li>Two</li></ol><a href="https://example.com">Safe</a>');
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<em>Italic</em>");
    expect(html).toContain("<u>Under</u>");
    expect(html).toContain("<ul><li>One</li></ul>");
    expect(html).toContain('<a href="https://example.com">Safe</a>');
  });

  it("removes scripts, event handlers, and javascript links", () => {
    const html = sanitizeRichHtml('<p onclick="alert(1)">Hello<script>alert(1)</script><a href="javascript:alert(1)">bad</a></p>');
    expect(html).toBe("<p>Hello<a>bad</a></p>");
    expect(html).not.toMatch(/script|onclick|javascript:/i);
  });

  it("preserves safe variable links in templates", () => {
    expect(normalizeRichTemplate('<p><a href="{{LINK}}">Visit {{NAME}}</a></p>').html)
      .toContain('href="{{LINK}}"');
  });

  it("converts existing plain text with paragraphs and line breaks", () => {
    const html = plainTextToHtml("Hi {{NAME}} Team,\nLine two\n\nRegards");
    expect(html).toBe("<p>Hi {{NAME}} Team,<br>Line two</p><p>Regards</p>");
    expect(htmlToPlainText(html)).toBe("Hi {{NAME}} Team,\nLine two\n\nRegards");
  });
});
