"use client";

import { useRef } from "react";

type RichTextEditorProps = {
  initialHtml: string;
  name: string;
  readOnly?: boolean;
  label: string;
};

const controls = [
  ["bold", "Bold"], ["italic", "Italic"], ["underline", "Underline"],
  ["insertUnorderedList", "Bullets"], ["insertOrderedList", "Numbers"],
  ["undo", "Undo"], ["redo", "Redo"], ["removeFormat", "Clear"],
] as const;

export function RichTextEditor({ initialHtml, name, readOnly = false, label }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function sync() {
    if (editorRef.current && inputRef.current) inputRef.current.value = editorRef.current.innerHTML;
  }

  function command(commandName: string) {
    editorRef.current?.focus();
    document.execCommand(commandName);
    sync();
  }

  function createLink() {
    const href = window.prompt("Link URL (https://, http://, mailto:, or {{LINK}})");
    if (!href) return;
    editorRef.current?.focus();
    document.execCommand("createLink", false, href.trim());
    sync();
  }

  return (
    <div>
      <span className="block text-sm font-bold">{label}</span>
      {!readOnly ? (
        <div aria-label={`${label} formatting`} className="rich-toolbar mt-2" role="toolbar">
          {controls.map(([commandName, controlLabel]) => (
            <button key={commandName} onMouseDown={(event) => event.preventDefault()} onClick={() => command(commandName)} type="button">{controlLabel}</button>
          ))}
          <button onMouseDown={(event) => event.preventDefault()} onClick={createLink} type="button">Link</button>
        </div>
      ) : null}
      <div
        aria-label={label}
        className={`rich-editor ${readOnly ? "rich-editor-readonly" : ""}`}
        contentEditable={!readOnly}
        dangerouslySetInnerHTML={{ __html: initialHtml }}
        onBlur={sync}
        onInput={sync}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
      />
      {!readOnly ? <input defaultValue={initialHtml} name={name} ref={inputRef} type="hidden" /> : null}
    </div>
  );
}
