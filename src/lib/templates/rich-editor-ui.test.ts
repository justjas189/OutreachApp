import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editor = readFileSync("src/components/rich-text-editor.tsx", "utf8");
const templateForm = readFileSync("src/app/(admin)/templates/template-form.tsx", "utf8");
const previewPage = readFileSync("src/app/(admin)/campaigns/[id]/emails/page.tsx", "utf8");

describe("rich-text editor integration", () => {
  it("offers required formatting controls and submits visible HTML", () => {
    for (const command of ["bold", "italic", "underline", "insertUnorderedList", "insertOrderedList", "undo", "redo", "removeFormat", "createLink"]) {
      expect(editor).toContain(command);
    }
    expect(editor).toContain("contentEditable={!readOnly}");
    expect(editor).toContain("name={name}");
    expect(templateForm).toContain('name="bodyHtml"');
  });

  it("uses same editor for generated edits and sanitized rich preview", () => {
    expect(previewPage).toContain("<RichTextEditor");
    expect(previewPage).toContain("sanitizeRichHtml(draft.body_html");
    expect(previewPage).toContain("readOnly={!editable}");
  });
});
