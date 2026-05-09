/**
 * RichTextEmailEditor — Word-like WYSIWYG email editor powered by TipTap v3.
 * Features a left Elements Panel with drag-and-drop insertion of email elements.
 */
import { useCallback, useState, useRef, useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import { Image as TipTapImage } from "@tiptap/extension-image";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Link2, Link2Off, Heading1, Heading2, Heading3, Heading4,
  Pilcrow, Highlighter, Undo2, Redo2, Type,
  Minus, MoveVertical, MousePointerClick, ImageIcon,
  Share2, MailMinus, FileText, GripVertical,
} from "lucide-react";

/* ─── HTML snippets for each insertable element ─── */
const ELEMENT_HTML: Record<string, string> = {
  button: `<p style="text-align:center;margin:20px 0;"><a href="https://example.com" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-weight:600;font-size:15px;padding:13px 34px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">Click Here</a></p>`,
  divider: `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">`,
  spacer: `<p style="margin:0;line-height:1;font-size:1px;padding:20px 0;">&nbsp;</p>`,
  image: `<p style="text-align:center;margin:16px 0;"><img src="https://placehold.co/480x200/f1f5f9/94a3b8?text=Image+Placeholder" alt="Image" style="display:block;max-width:100%;height:auto;border-radius:8px;margin:0 auto;" /></p>`,
  social: `<p style="text-align:center;margin:20px 0 8px;"><a href="#" style="display:inline-block;margin:0 5px;color:#6b7280;text-decoration:none;border:1px solid #e5e7eb;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:500;">Facebook</a><a href="#" style="display:inline-block;margin:0 5px;color:#6b7280;text-decoration:none;border:1px solid #e5e7eb;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:500;">Twitter</a><a href="#" style="display:inline-block;margin:0 5px;color:#6b7280;text-decoration:none;border:1px solid #e5e7eb;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:500;">Instagram</a><a href="#" style="display:inline-block;margin:0 5px;color:#6b7280;text-decoration:none;border:1px solid #e5e7eb;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:500;">YouTube</a></p>`,
  unsubscribe: `<p style="text-align:center;font-size:12px;color:#9ca3af;margin:16px 0 4px;">Don't want these emails?&nbsp;<a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:underline;">Unsubscribe here</a></p>`,
  footer: `<p style="font-size:12px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:16px;margin:20px 0 0;">© 2025 Upcalify · All rights reserved<br><a href="#" style="color:#9ca3af;">Privacy Policy</a>&nbsp;·&nbsp;<a href="#" style="color:#9ca3af;">Terms of Service</a></p>`,
};

/* ─── Elements panel definition ─── */
const ELEMENT_GROUPS = [
  {
    group: "Layout",
    items: [
      { key: "divider", label: "Divider", icon: Minus, desc: "Horizontal rule" },
      { key: "spacer", label: "Spacer", icon: MoveVertical, desc: "Vertical gap" },
    ],
  },
  {
    group: "Content",
    items: [
      { key: "button", label: "Button", icon: MousePointerClick, desc: "CTA button" },
      { key: "image", label: "Image", icon: ImageIcon, desc: "Image block" },
    ],
  },
  {
    group: "Footer",
    items: [
      { key: "social", label: "Social Icons", icon: Share2, desc: "Social links" },
      { key: "unsubscribe", label: "Unsubscribe", icon: MailMinus, desc: "Opt-out link" },
      { key: "footer", label: "Footer", icon: FileText, desc: "Footer block" },
    ],
  },
];

/* Insert element HTML into the editor at a given position (or cursor) */
function insertElement(editor: Editor, key: string, pos?: number) {
  const html = ELEMENT_HTML[key];
  if (!html) return;
  if (key === "divider") {
    if (pos !== undefined) {
      editor.chain().focus().insertContentAt(pos, { type: "horizontalRule" }).run();
    } else {
      editor.chain().focus().setHorizontalRule().run();
    }
    return;
  }
  if (pos !== undefined) {
    editor.chain().focus().insertContentAt(pos, html).run();
  } else {
    editor.chain().focus().insertContent(html).run();
  }
}

/* ─── Elements Panel ─── */
function ElementsPanel({ editor, isDragOver }: { editor: Editor; isDragOver: boolean }) {
  const handleDragStart = (e: React.DragEvent, key: string) => {
    e.dataTransfer.setData("text/element-key", key);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="w-[148px] flex-shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto">
      <div className="p-2 pb-1">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-1">Elements</p>
        <p className="text-[9px] text-slate-400 px-1 mb-2 leading-tight">Click or drag onto the canvas</p>
      </div>

      {ELEMENT_GROUPS.map(group => (
        <div key={group.group} className="px-2 mb-3">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-1.5">{group.group}</p>
          <div className="space-y-1">
            {group.items.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  draggable
                  onDragStart={e => handleDragStart(e, item.key)}
                  onClick={() => { editor.chain().focus().run(); insertElement(editor, item.key); }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-all cursor-grab active:cursor-grabbing group select-none"
                  title={`${item.desc} — click to insert at cursor, or drag onto the email`}
                >
                  <GripVertical className="w-2.5 h-2.5 text-slate-300 group-hover:text-blue-300 flex-shrink-0" />
                  <Icon className="w-3 h-3 flex-shrink-0" />
                  <span className="text-[11px] font-medium truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {isDragOver && (
        <div className="mx-2 mt-1 px-2 py-2 rounded-lg bg-blue-50 border border-dashed border-blue-300">
          <p className="text-[10px] text-blue-600 text-center">Drop on the email canvas →</p>
        </div>
      )}
    </div>
  );
}

/* ─── Email wrapper ─── */
function wrapRichTextInEmail(bodyHtml: string, settings: {
  bgColor: string; cardBgColor: string; cardPadding: number; fontFamily: string; companyName: string;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email</title></head>
<body style="margin:0;padding:0;background-color:${settings.bgColor};font-family:${settings.fontFamily};">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${settings.bgColor};padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:${settings.cardBgColor};border-radius:12px;padding:${settings.cardPadding}px;box-sizing:border-box;">
<tr><td>
<div style="font-family:${settings.fontFamily};font-size:15px;line-height:1.7;color:#374151;">
${bodyHtml}
</div>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

/* ─── Toolbar Button ─── */
function TB({ onClick, active, title, children, disabled }: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      disabled={disabled}
      className={`h-7 min-w-[28px] px-1.5 flex items-center justify-center rounded text-xs font-medium transition-colors
        ${active ? "bg-blue-600 text-white" : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"}
        ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}

function TBDivider() {
  return <div className="w-px h-5 bg-slate-200 mx-0.5 flex-shrink-0" />;
}

/* ─── Link Dialog ─── */
function LinkDialog({ onConfirm, onClose, current }: { onConfirm: (url: string) => void; onClose: () => void; current: string }) {
  const [url, setUrl] = useState(current || "https://");
  return (
    <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl p-3 w-72" onClick={e => e.stopPropagation()}>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Insert Link</p>
      <input
        autoFocus
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onConfirm(url); if (e.key === "Escape") onClose(); }}
        className="w-full h-8 px-2.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 outline-none focus:border-blue-400 mb-2"
        placeholder="https://example.com"
      />
      <div className="flex gap-2">
        <button type="button" onClick={() => onConfirm(url)}
          className="flex-1 h-7 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">Insert</button>
        <button type="button" onClick={onClose}
          className="flex-1 h-7 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">Cancel</button>
      </div>
    </div>
  );
}

/* ─── Exported Types ─── */
export interface RichTextEmailEditorProps {
  value: string;
  onChange: (html: string) => void;
  settings: { bgColor: string; cardBgColor: string; cardPadding: number; fontFamily: string; companyName: string };
}

const FONT_SIZES = ["12", "13", "14", "15", "16", "18", "20", "22", "24", "28", "32", "36", "48"];
const FONT_FAMILIES = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
];

/* Extract inner body HTML from a full email wrapper (for TipTap init) */
function extractBodyContent(html: string): string {
  if (!html || html.trim().length < 10) return "";
  const divMatch = html.match(/<div style="font-family[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/td>/);
  if (divMatch) return divMatch[1].trim();
  if (!html.includes("<!DOCTYPE")) return html;
  return "";
}

/* ─── Main Export ─── */
export function RichTextEmailEditor({ value, onChange, settings }: RichTextEmailEditorProps) {
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedColor, setSelectedColor] = useState("#374151");
  const [selectedHighlight, setSelectedHighlight] = useState("#fef08a");
  const [isDragOver, setIsDragOver] = useState(false);
  const linkBtnRef = useRef<HTMLDivElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  // Saved selection — captures the active selection before toolbar controls steal focus
  const savedSel = useRef<{ from: number; to: number } | null>(null);

  const initialContent = extractBodyContent(value) || "<p>Start typing or paste your email content here. Select any text to format it.</p>";

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, underline: false } as any),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TipTapImage.configure({ inline: false, allowBase64: false, HTMLAttributes: { style: "max-width:100%;height:auto;display:block;margin:0 auto;border-radius:8px;" } }),
    ],
    content: initialContent,
    onUpdate({ editor }) {
      const bodyHtml = editor.getHTML();
      onChange(wrapRichTextInEmail(bodyHtml, settings));
    },
  }, []);

  // Close link dialog on outside click
  useEffect(() => {
    if (!showLinkDialog) return;
    const handler = (e: MouseEvent) => {
      if (linkBtnRef.current && !linkBtnRef.current.contains(e.target as Node)) setShowLinkDialog(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showLinkDialog]);

  const insertLink = useCallback((url: string) => {
    if (!editor) return;
    setShowLinkDialog(false);
    if (!url || url === "https://") { editor.chain().focus().unsetLink().run(); return; }
    editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  /* ── Selection save/restore for toolbar controls that steal focus ──
     Call saveSelection() in onMouseDown of any <select> or <label>/<input>
     that will blur the editor. Then call applyWithSel() in onChange to
     restore the selection before running the command.                   */
  const saveSelection = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    savedSel.current = { from, to };
  }, [editor]);

  const applyWithSel = useCallback((fn: (e: Editor) => void) => {
    if (!editor) return;
    const sel = savedSel.current;
    savedSel.current = null;
    if (sel) {
      // Restore saved selection, then run the formatting command
      editor.chain()
        .focus()
        .setTextSelection({ from: sel.from, to: sel.to })
        .run();
    } else {
      editor.commands.focus();
    }
    fn(editor);
  }, [editor]);

  /* ── Drag & drop handlers on the canvas ── */
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("text/element-key")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsDragOver(true);
    }
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!editorWrapRef.current?.contains(e.relatedTarget as Node)) setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const key = e.dataTransfer.getData("text/element-key");
    if (!key || !editor) return;

    // Try to find the exact TipTap position at the drop coordinates
    const coords = { left: e.clientX, top: e.clientY };
    const pos = editor.view.posAtCoords(coords);
    insertElement(editor, key, pos?.pos);
  };

  if (!editor) return null;

  const currentFontSize = editor.getAttributes("textStyle").fontSize?.replace("px", "") ?? "15";
  const currentFontFamily = editor.getAttributes("textStyle").fontFamily ?? settings.fontFamily;

  return (
    <div className="flex flex-col h-full text-gray-900">
      {/* ── Formatting Toolbar ── */}
      <div className="bg-slate-50 border-b border-slate-200 px-2 py-1.5 flex items-center gap-0.5 flex-wrap flex-shrink-0">

        <TB onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive("paragraph")} title="Paragraph">
          <Pilcrow className="w-3.5 h-3.5" />
        </TB>
        <TB onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">
          <Heading1 className="w-3.5 h-3.5" />
        </TB>
        <TB onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
          <Heading2 className="w-3.5 h-3.5" />
        </TB>
        <TB onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">
          <Heading3 className="w-3.5 h-3.5" />
        </TB>
        <TB onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} active={editor.isActive("heading", { level: 4 })} title="Heading 4">
          <Heading4 className="w-3.5 h-3.5" />
        </TB>

        <TBDivider />

        <TB onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold (Ctrl+B)">
          <Bold className="w-3.5 h-3.5" />
        </TB>
        <TB onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic (Ctrl+I)">
          <Italic className="w-3.5 h-3.5" />
        </TB>
        <TB onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline (Ctrl+U)">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </TB>
        <TB onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough">
          <Strikethrough className="w-3.5 h-3.5" />
        </TB>

        <TBDivider />

        {/* Text color */}
        <label
          onMouseDown={saveSelection}
          className="h-7 min-w-[28px] px-1 flex flex-col items-center justify-center rounded cursor-pointer hover:bg-slate-100 gap-0.5"
          title="Text Color"
        >
          <Type className="w-3 h-3 text-slate-600" />
          <div className="w-4 h-1 rounded-sm" style={{ backgroundColor: selectedColor }} />
          <input type="color" className="sr-only" value={selectedColor}
            onChange={e => {
              const v = e.target.value;
              setSelectedColor(v);
              applyWithSel(ed => ed.chain().setColor(v).run());
            }}
          />
        </label>

        {/* Highlight color */}
        <label
          onMouseDown={saveSelection}
          className="h-7 min-w-[28px] px-1 flex flex-col items-center justify-center rounded cursor-pointer hover:bg-slate-100 gap-0.5"
          title="Highlight Color"
        >
          <Highlighter className="w-3 h-3 text-slate-600" />
          <div className="w-4 h-1 rounded-sm" style={{ backgroundColor: selectedHighlight }} />
          <input type="color" className="sr-only" value={selectedHighlight}
            onChange={e => {
              const v = e.target.value;
              setSelectedHighlight(v);
              applyWithSel(ed => ed.chain().setHighlight({ color: v }).run());
            }}
          />
        </label>

        <TBDivider />

        <TB onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet List">
          <List className="w-3.5 h-3.5" />
        </TB>
        <TB onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Ordered List">
          <ListOrdered className="w-3.5 h-3.5" />
        </TB>

        <TBDivider />

        <TB onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align Left">
          <AlignLeft className="w-3.5 h-3.5" />
        </TB>
        <TB onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Align Center">
          <AlignCenter className="w-3.5 h-3.5" />
        </TB>
        <TB onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align Right">
          <AlignRight className="w-3.5 h-3.5" />
        </TB>

        <TBDivider />

        {/* Link */}
        <div className="relative" ref={linkBtnRef}>
          <TB onClick={() => {
            if (editor.isActive("link")) { editor.chain().focus().unsetLink().run(); }
            else { setShowLinkDialog(v => !v); }
          }} active={editor.isActive("link")} title={editor.isActive("link") ? "Remove Link" : "Insert Link"}>
            {editor.isActive("link") ? <Link2Off className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
          </TB>
          {showLinkDialog && (
            <LinkDialog current={editor.getAttributes("link").href ?? ""} onConfirm={insertLink} onClose={() => setShowLinkDialog(false)} />
          )}
        </div>

        <TBDivider />

        <select
          value={currentFontFamily}
          onMouseDown={saveSelection}
          onChange={e => { const v = e.target.value; applyWithSel(ed => ed.chain().setFontFamily(v).run()); }}
          title="Font Family"
          className="h-7 px-1.5 text-[11px] border border-slate-200 rounded bg-white text-slate-700 outline-none cursor-pointer hover:border-slate-300"
          style={{ maxWidth: 88 }}>
          {FONT_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        <select
          value={currentFontSize}
          onMouseDown={saveSelection}
          onChange={e => { const v = e.target.value + "px"; applyWithSel(ed => ed.chain().setFontSize(v).run()); }}
          title="Font Size"
          className="h-7 px-1 text-[11px] border border-slate-200 rounded bg-white text-slate-700 outline-none cursor-pointer hover:border-slate-300 w-14">
          {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
        </select>

        <TBDivider />

        <TB onClick={() => editor.chain().focus().undo().run()} title="Undo" disabled={!editor.can().undo()}>
          <Undo2 className="w-3.5 h-3.5" />
        </TB>
        <TB onClick={() => editor.chain().focus().redo().run()} title="Redo" disabled={!editor.can().redo()}>
          <Redo2 className="w-3.5 h-3.5" />
        </TB>
      </div>

      {/* ── Body: Elements Panel + Canvas ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Elements Panel */}
        <ElementsPanel editor={editor} isDragOver={isDragOver} />

        {/* Right: Email Canvas */}
        <div
          ref={editorWrapRef}
          className="flex-1 overflow-y-auto p-4 transition-colors relative"
          style={{ background: isDragOver ? "#eff6ff" : settings.bgColor }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragOver && (
            <div className="absolute inset-0 border-2 border-dashed border-blue-400 rounded pointer-events-none z-20 flex items-center justify-center bg-blue-50/30">
              <span className="text-blue-600 text-sm font-semibold bg-white px-5 py-2.5 rounded-xl shadow-lg border border-blue-200">
                Drop element here
              </span>
            </div>
          )}

          <div
            className="mx-auto rounded-xl shadow-sm relative"
            style={{ maxWidth: 560, background: settings.cardBgColor, padding: settings.cardPadding }}
          >
            <EditorContent editor={editor} className="rich-email-editor outline-none" />
          </div>

          <p className="text-center text-[10px] text-slate-400 mt-3">
            Click any element in the panel to insert at cursor · Drag elements onto the email canvas
          </p>
        </div>
      </div>

      <style>{`
        .rich-email-editor .tiptap {
          outline: none;
          min-height: 280px;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 15px;
          line-height: 1.7;
          color: #374151;
        }
        .rich-email-editor .tiptap p { margin: 0 0 12px; }
        .rich-email-editor .tiptap h1 { font-size: 26px; font-weight: 700; color: #111827; margin: 0 0 16px; }
        .rich-email-editor .tiptap h2 { font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 14px; }
        .rich-email-editor .tiptap h3 { font-size: 17px; font-weight: 700; color: #111827; margin: 0 0 12px; }
        .rich-email-editor .tiptap h4 { font-size: 15px; font-weight: 700; color: #111827; margin: 0 0 10px; }
        .rich-email-editor .tiptap ul { padding-left: 24px; margin: 0 0 16px; }
        .rich-email-editor .tiptap ol { padding-left: 24px; margin: 0 0 16px; }
        .rich-email-editor .tiptap li { margin-bottom: 6px; }
        .rich-email-editor .tiptap a { color: #2563eb; text-decoration: underline; }
        .rich-email-editor .tiptap strong { font-weight: 700; }
        .rich-email-editor .tiptap em { font-style: italic; }
        .rich-email-editor .tiptap s { text-decoration: line-through; }
        .rich-email-editor .tiptap u { text-decoration: underline; }
        .rich-email-editor .tiptap mark { border-radius: 2px; padding: 0 2px; }
        .rich-email-editor .tiptap hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
        .rich-email-editor .tiptap img { max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 8px; }
        .rich-email-editor .tiptap p.is-editor-empty:first-child::before {
          color: #94a3b8;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
