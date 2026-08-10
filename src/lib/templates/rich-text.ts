import sanitizeHtml from "sanitize-html";

const allowedTags = ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a"];
const variableHrefPattern = /href=(['"])(\{\{\s*(?:LINK|EMAIL)\s*\}\})\1/gi;
const hrefSentinelPrefix = "https://atlasreach.invalid/__atlasreach_variable_";

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function sanitizeRichHtml(value: string, preserveVariableLinks = false): string {
  const protectedValue = preserveVariableLinks
    ? value.replace(variableHrefPattern, (_match, _quote, variable: string) => {
        const name = variable.replace(/[{}\s]/g, "").toUpperCase();
        return `href="${hrefSentinelPrefix}${name}__"`;
      })
    : value;
  const sanitized = sanitizeHtml(protectedValue, {
    allowedTags,
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
    transformTags: {
      a: (_tagName, attributes) => {
        const attribs: Record<string, string> = attributes.href ? { href: attributes.href } : {};
        return { tagName: "a", attribs };
      },
    },
  });
  return preserveVariableLinks
    ? sanitized.replace(new RegExp(`${hrefSentinelPrefix}(LINK|EMAIL)__`, "g"), "{{$1}}")
    : sanitized;
}

export function plainTextToHtml(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function htmlToPlainText(value: string): string {
  const structural = sanitizeRichHtml(value)
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*li(?:\s[^>]*)?>/gi, "- ")
    .replace(/<\s*\/li\s*>/gi, "\n")
    .replace(/<\s*\/(?:p|ul|ol)\s*>/gi, "\n\n");
  return sanitizeHtml(structural, { allowedTags: [], allowedAttributes: {} })
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeRichTemplate(html: string): { html: string; text: string } {
  const sanitized = sanitizeRichHtml(html, true).trim();
  const text = htmlToPlainText(sanitized);
  if (!sanitized || !text) throw new Error("Rich-text body is empty.");
  return { html: sanitized, text };
}
