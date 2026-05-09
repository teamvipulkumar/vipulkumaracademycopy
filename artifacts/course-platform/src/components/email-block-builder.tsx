/**
 * EmailBlockBuilder — Drag-free block-based email template builder.
 * Produces professional email HTML compatible with major email clients.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Trash2, ChevronUp, ChevronDown, Settings2, X, Type,
  Image as ImageIcon, Minus, AlignCenter, MousePointer, List,
  Users, FileText, MoveVertical, Layers, Eye, Code2, Check,
  LogIn, Globe, PenLine,
} from "lucide-react";
import { RichTextEmailEditor } from "./rich-text-email-editor";

/* ─────────────────────── Types ─────────────────────── */
type BlockType =
  | "logo" | "heading" | "text" | "button" | "image"
  | "bulletList" | "divider" | "spacer" | "social" | "footer" | "columns";

interface SocialLink { platform: "twitter" | "linkedin" | "youtube" | "instagram" | "facebook" | "github"; url: string; }
interface BulletItem { boldLabel: string; text: string; }

interface Block {
  id: string;
  type: BlockType;
  data: Record<string, any>;
}

interface EmailSettings {
  bgColor: string;
  cardBgColor: string;
  cardPadding: number;
  logoUrl: string;
  companyName: string;
  fontFamily: string;
}

/* ─────────────────────── Defaults ─────────────────────── */
const DEFAULT_SETTINGS: EmailSettings = {
  bgColor: "#ebeced",
  cardBgColor: "#fcfcfc",
  cardPadding: 40,
  logoUrl: "",
  companyName: "Upcalify",
  fontFamily: "Arial, Helvetica, sans-serif",
};

function uid() { return Math.random().toString(36).slice(2, 9); }

const DEFAULT_BLOCK_DATA: Record<BlockType, () => Record<string, any>> = {
  logo: () => ({ logoUrl: "", altText: "Company Logo", width: 120, linkUrl: "" }),
  heading: () => ({ text: "Hello {{name}},", level: 1, color: "#111827", align: "left" }),
  text: () => ({ content: "We're thrilled to have you on board. Your learning journey starts now.", color: "#374151", fontSize: 15, lineHeight: 1.7 }),
  button: () => ({ text: "Get Started", url: "https://", bgColor: "#2563eb", textColor: "#ffffff", align: "center", borderRadius: 6 }),
  image: () => ({ url: "", altText: "", width: 100, linkUrl: "" }),
  bulletList: () => ({
    items: [
      { boldLabel: "Courses", text: "Access all your enrolled courses from your dashboard." },
      { boldLabel: "Progress", text: "Track your learning progress and resume where you left off." },
      { boldLabel: "Support", text: "Our team is available 24/7 to help with any questions." },
    ] as BulletItem[],
    color: "#374151",
    fontSize: 15,
  }),
  divider: () => ({ color: "#e5e7eb", margin: 24 }),
  spacer: () => ({ height: 20 }),
  social: () => ({
    links: [
      { platform: "twitter", url: "https://twitter.com/" },
      { platform: "linkedin", url: "https://linkedin.com/" },
      { platform: "youtube", url: "https://youtube.com/" },
    ] as SocialLink[],
    iconColor: "#6b7280",
  }),
  footer: () => ({
    address: "Upcalify, India",
    unsubscribeUrl: "{{unsubscribe_url}}",
    textColor: "#9ca3af",
  }),
  columns: () => ({
    left: "<p style='color:#374151;font-size:15px;margin:0;'>Left column content</p>",
    right: "<p style='color:#374151;font-size:15px;margin:0;'>Right column content</p>",
  }),
};

const BLOCK_META: Record<BlockType, { label: string; icon: React.ReactNode; description: string }> = {
  logo: { label: "Logo", icon: <Globe className="w-3.5 h-3.5" />, description: "Centered logo image" },
  heading: { label: "Heading", icon: <Type className="w-3.5 h-3.5" />, description: "H1, H2, or H3 text" },
  text: { label: "Text", icon: <FileText className="w-3.5 h-3.5" />, description: "Paragraph of text" },
  button: { label: "Button", icon: <MousePointer className="w-3.5 h-3.5" />, description: "Call-to-action button" },
  image: { label: "Image", icon: <ImageIcon className="w-3.5 h-3.5" />, description: "Full-width image" },
  bulletList: { label: "Bullet List", icon: <List className="w-3.5 h-3.5" />, description: "List with bold labels" },
  divider: { label: "Divider", icon: <Minus className="w-3.5 h-3.5" />, description: "Horizontal rule" },
  spacer: { label: "Spacer", icon: <MoveVertical className="w-3.5 h-3.5" />, description: "Vertical whitespace" },
  social: { label: "Social Icons", icon: <Users className="w-3.5 h-3.5" />, description: "Social media links" },
  footer: { label: "Footer", icon: <AlignCenter className="w-3.5 h-3.5" />, description: "Address & unsubscribe" },
  columns: { label: "Two Columns", icon: <Layers className="w-3.5 h-3.5" />, description: "Side-by-side columns" },
};

const SOCIAL_ICONS: Record<string, string> = {
  twitter: "𝕏",
  linkedin: "in",
  youtube: "▶",
  instagram: "◉",
  facebook: "f",
  github: "⌥",
};

/* ─────────────────────── HTML Generator ─────────────────────── */
function renderBlockHtml(block: Block): string {
  const { type, data } = block;
  switch (type) {
    case "logo":
      if (!data.logoUrl) return `<div style="text-align:center;padding:8px 0;color:#9ca3af;font-size:13px;">[Logo placeholder]</div>`;
      const logoA = data.linkUrl ? `<a href="${data.linkUrl}" style="display:inline-block;">` : "";
      const logoAEnd = data.linkUrl ? `</a>` : "";
      return `<div style="text-align:center;margin-bottom:24px;">${logoA}<img src="${data.logoUrl}" alt="${data.altText || 'Logo'}" width="${data.width || 120}" style="display:inline-block;max-width:100%;height:auto;" />${logoAEnd}</div>`;
    case "heading":
      const tag = `h${data.level || 1}`;
      const hSize = data.level === 1 ? "26px" : data.level === 2 ? "20px" : "16px";
      const hWeight = "700";
      return `<${tag} style="margin:0 0 16px;font-size:${hSize};font-weight:${hWeight};color:${data.color || "#111827"};text-align:${data.align || "left"};">${data.text || "Heading"}</${tag}>`;
    case "text":
      const lines = (data.content || "").split("\n").filter(Boolean);
      return lines.map((l: string) => `<p style="margin:0 0 12px;font-size:${data.fontSize || 15}px;line-height:${data.lineHeight || 1.7};color:${data.color || "#374151"};">${l}</p>`).join("") || `<p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#374151;">${data.content || "Text content"}</p>`;
    case "button":
      const btnAlign = data.align || "center";
      return `<div style="text-align:${btnAlign};margin:24px 0;"><a href="${data.url || '#'}" target="_blank" style="display:inline-block;padding:13px 32px;background-color:${data.bgColor || "#2563eb"};color:${data.textColor || "#ffffff"};text-decoration:none;border-radius:${data.borderRadius || 6}px;font-weight:600;font-size:15px;line-height:1;">${data.text || "Click Here"}</a></div>`;
    case "image":
      if (!data.url) return `<div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px;color:#9ca3af;font-size:13px;margin-bottom:16px;">[Image placeholder]</div>`;
      const imgW = data.width ? `width="${data.width}%"` : `style="max-width:100%;height:auto;"`;
      const imgA = data.linkUrl ? `<a href="${data.linkUrl}" style="display:block;">` : "";
      const imgAEnd = data.linkUrl ? `</a>` : "";
      return `<div style="margin:0 0 16px;text-align:center;">${imgA}<img src="${data.url}" alt="${data.altText || ''}" ${imgW} style="display:block;margin:0 auto;max-width:100%;height:auto;border-radius:6px;" />${imgAEnd}</div>`;
    case "bulletList":
      const items: BulletItem[] = data.items || [];
      const lis = items.map(item =>
        `<li style="margin:0 0 10px;font-size:${data.fontSize || 15}px;line-height:1.7;color:${data.color || "#374151"};">${item.boldLabel ? `<strong>${item.boldLabel}</strong> — ` : ""}${item.text}</li>`
      ).join("");
      return `<ul style="margin:0 0 16px;padding-left:24px;">${lis}</ul>`;
    case "divider":
      return `<div style="margin:${data.margin || 24}px 0;"><hr style="border:none;border-top:1px solid ${data.color || "#e5e7eb"};margin:0;" /></div>`;
    case "spacer":
      return `<div style="height:${data.height || 20}px;"></div>`;
    case "social": {
      const links: SocialLink[] = data.links || [];
      const iconHtml = links.map(l => {
        const iconMap: Record<string, string> = {
          twitter: `<svg width="20" height="20" viewBox="0 0 24 24" fill="${data.iconColor || "#6b7280"}"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
          linkedin: `<svg width="20" height="20" viewBox="0 0 24 24" fill="${data.iconColor || "#6b7280"}"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
          youtube: `<svg width="20" height="20" viewBox="0 0 24 24" fill="${data.iconColor || "#6b7280"}"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
          instagram: `<svg width="20" height="20" viewBox="0 0 24 24" fill="${data.iconColor || "#6b7280"}"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`,
          facebook: `<svg width="20" height="20" viewBox="0 0 24 24" fill="${data.iconColor || "#6b7280"}"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
          github: `<svg width="20" height="20" viewBox="0 0 24 24" fill="${data.iconColor || "#6b7280"}"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`,
        };
        return `<a href="${l.url || '#'}" target="_blank" style="display:inline-block;margin:0 6px;">${iconMap[l.platform] || l.platform}</a>`;
      }).join("");
      return `<div style="text-align:center;padding:8px 0;">${iconHtml}</div>`;
    }
    case "footer":
      return `<div style="text-align:center;padding:16px 0 0;"><p style="font-size:12px;color:${data.textColor || "#9ca3af"};line-height:1.6;margin:0 0 6px;">${data.address || ""}</p><p style="margin:0;"><a href="${data.unsubscribeUrl || '#'}" style="font-size:12px;color:#6b7280;text-decoration:underline;">Unsubscribe</a></p></div>`;
    case "columns":
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;"><tr><td width="48%" valign="top" style="padding-right:8px;">${data.left || ""}</td><td width="4%"></td><td width="48%" valign="top" style="padding-left:8px;">${data.right || ""}</td></tr></table>`;
    default:
      return "";
  }
}

function generateHTML(blocks: Block[], settings: EmailSettings): string {
  const blocksJson = JSON.stringify({ blocks, settings });
  const cardBlocks: Block[] = [];
  const beforeCard: Block[] = [];
  const afterCard: Block[] = [];

  let inCard = true;
  for (const b of blocks) {
    if (b.type === "logo") beforeCard.push(b);
    else if (b.type === "social" || b.type === "footer") afterCard.push(b);
    else cardBlocks.push(b);
  }

  const cardHtml = cardBlocks.map(renderBlockHtml).join("\n");
  const beforeHtml = beforeCard.map(renderBlockHtml).join("\n");
  const afterHtml = afterCard.map(renderBlockHtml).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { box-sizing: border-box; }
body { margin: 0; padding: 0; background: ${settings.bgColor}; font-family: ${settings.fontFamily}; -webkit-font-smoothing: antialiased; }
a { color: #2563eb; }
img { border: 0; outline: none; text-decoration: none; }
</style>
</head>
<body>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${settings.bgColor};padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
${beforeHtml ? `<tr><td style="padding-bottom:16px;">${beforeHtml}</td></tr>` : ""}
<tr><td>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${settings.cardBgColor};border-radius:16px;">
<tr><td style="padding:${settings.cardPadding}px;">
${cardHtml}
</td></tr>
</table>
</td></tr>
${afterHtml ? `<tr><td style="padding-top:8px;">${afterHtml}</td></tr>` : ""}
</table>
</td></tr>
</table>
<!-- EMAIL_BLOCKS_DATA:${blocksJson} -->
</body>
</html>`;
}

function parseBlocks(html: string): { blocks: Block[]; settings: EmailSettings } | null {
  try {
    const match = html.match(/<!-- EMAIL_BLOCKS_DATA:(.+?) -->/s);
    if (!match) return null;
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed.blocks)) return parsed;
    return null;
  } catch { return null; }
}

function defaultWelcomeBlocks(): Block[] {
  return [
    { id: uid(), type: "logo", data: DEFAULT_BLOCK_DATA.logo() },
    { id: uid(), type: "heading", data: { ...DEFAULT_BLOCK_DATA.heading(), text: "Hi {{name}}," } },
    { id: uid(), type: "text", data: { ...DEFAULT_BLOCK_DATA.text(), content: "Welcome to Upcalify! We're excited to have you join our community of learners.\n\nYour account is ready. Here's what you can do:" } },
    { id: uid(), type: "bulletList", data: DEFAULT_BLOCK_DATA.bulletList() },
    { id: uid(), type: "button", data: { ...DEFAULT_BLOCK_DATA.button(), text: "Start Learning" } },
    { id: uid(), type: "divider", data: DEFAULT_BLOCK_DATA.divider() },
    { id: uid(), type: "text", data: { ...DEFAULT_BLOCK_DATA.text(), content: "Happy learning,\nThe Upcalify Team" } },
    { id: uid(), type: "social", data: DEFAULT_BLOCK_DATA.social() },
    { id: uid(), type: "footer", data: DEFAULT_BLOCK_DATA.footer() },
  ];
}

/* ─────────────────────── Block Editors ─────────────────────── */
function Input({ label, value, onChange, type = "text", placeholder = "" }: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full h-8 px-2.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 outline-none focus:border-blue-400 transition-colors" />
    </div>
  );
}
function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void; }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="h-8 w-8 rounded border border-slate-300 cursor-pointer p-0.5 flex-shrink-0" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          className="flex-1 h-8 px-2.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 outline-none focus:border-blue-400 font-mono" />
      </div>
    </div>
  );
}
function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { label: string; value: string }[];
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full h-8 px-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 outline-none cursor-pointer">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
function Textarea({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (v: string) => void; rows?: number; }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
        className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 outline-none focus:border-blue-400 transition-colors resize-none" />
    </div>
  );
}

function BlockEditor({ block, onChange }: { block: Block; onChange: (data: Record<string, any>) => void }) {
  const d = block.data;
  const upd = (patch: Record<string, any>) => onChange({ ...d, ...patch });

  switch (block.type) {
    case "logo":
      return (
        <div className="space-y-3 p-3">
          <Input label="Logo Image URL" value={d.logoUrl || ""} onChange={v => upd({ logoUrl: v })} placeholder="https://yoursite.com/logo.png" />
          <Input label="Alt Text" value={d.altText || ""} onChange={v => upd({ altText: v })} />
          <Input label="Logo Width (px)" value={d.width || 120} type="number" onChange={v => upd({ width: parseInt(v) || 120 })} />
          <Input label="Link URL (optional)" value={d.linkUrl || ""} onChange={v => upd({ linkUrl: v })} placeholder="https://" />
        </div>
      );
    case "heading":
      return (
        <div className="space-y-3 p-3">
          <Textarea label="Heading Text" value={d.text || ""} onChange={v => upd({ text: v })} rows={2} />
          <Select label="Level" value={String(d.level || 1)} onChange={v => upd({ level: parseInt(v) })} options={[{ label: "H1 — Large", value: "1" }, { label: "H2 — Medium", value: "2" }, { label: "H3 — Small", value: "3" }]} />
          <Select label="Alignment" value={d.align || "left"} onChange={v => upd({ align: v })} options={[{ label: "Left", value: "left" }, { label: "Center", value: "center" }, { label: "Right", value: "right" }]} />
          <ColorInput label="Color" value={d.color || "#111827"} onChange={v => upd({ color: v })} />
        </div>
      );
    case "text":
      return (
        <div className="space-y-3 p-3">
          <Textarea label="Content (one paragraph per line)" value={d.content || ""} onChange={v => upd({ content: v })} rows={5} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Font Size (px)" value={d.fontSize || 15} type="number" onChange={v => upd({ fontSize: parseInt(v) || 15 })} />
            <Input label="Line Height" value={d.lineHeight || 1.7} type="number" onChange={v => upd({ lineHeight: parseFloat(v) || 1.7 })} />
          </div>
          <ColorInput label="Text Color" value={d.color || "#374151"} onChange={v => upd({ color: v })} />
        </div>
      );
    case "button":
      return (
        <div className="space-y-3 p-3">
          <Input label="Button Text" value={d.text || ""} onChange={v => upd({ text: v })} />
          <Input label="Link URL" value={d.url || ""} onChange={v => upd({ url: v })} placeholder="https://" />
          <div className="grid grid-cols-2 gap-2">
            <ColorInput label="Background Color" value={d.bgColor || "#2563eb"} onChange={v => upd({ bgColor: v })} />
            <ColorInput label="Text Color" value={d.textColor || "#ffffff"} onChange={v => upd({ textColor: v })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select label="Alignment" value={d.align || "center"} onChange={v => upd({ align: v })} options={[{ label: "Left", value: "left" }, { label: "Center", value: "center" }, { label: "Right", value: "right" }]} />
            <Input label="Corner Radius (px)" value={d.borderRadius ?? 6} type="number" onChange={v => upd({ borderRadius: parseInt(v) || 0 })} />
          </div>
        </div>
      );
    case "image":
      return (
        <div className="space-y-3 p-3">
          <Input label="Image URL" value={d.url || ""} onChange={v => upd({ url: v })} placeholder="https://example.com/image.jpg" />
          <Input label="Alt Text" value={d.altText || ""} onChange={v => upd({ altText: v })} />
          <Input label="Width (%)" value={d.width ?? 100} type="number" onChange={v => upd({ width: parseInt(v) || 100 })} />
          <Input label="Link URL (optional)" value={d.linkUrl || ""} onChange={v => upd({ linkUrl: v })} placeholder="https://" />
        </div>
      );
    case "bulletList": {
      const items: BulletItem[] = d.items || [];
      return (
        <div className="space-y-3 p-3">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">List Items</label>
            {items.map((item, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-400">Item {idx + 1}</span>
                  <button type="button" onClick={() => {
                    const next = items.filter((_, i) => i !== idx);
                    upd({ items: next });
                  }} className="text-red-400 hover:text-red-600 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <input type="text" value={item.boldLabel} placeholder="Bold label (optional)"
                  onChange={e => { const next = [...items]; next[idx] = { ...item, boldLabel: e.target.value }; upd({ items: next }); }}
                  className="w-full h-7 px-2 text-xs border border-slate-300 rounded bg-white text-slate-800 outline-none focus:border-blue-400" />
                <input type="text" value={item.text} placeholder="Item text…"
                  onChange={e => { const next = [...items]; next[idx] = { ...item, text: e.target.value }; upd({ items: next }); }}
                  className="w-full h-7 px-2 text-xs border border-slate-300 rounded bg-white text-slate-800 outline-none focus:border-blue-400" />
              </div>
            ))}
            <button type="button" onClick={() => upd({ items: [...items, { boldLabel: "", text: "" }] })}
              className="w-full h-8 text-xs text-blue-600 border border-blue-200 border-dashed rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5">
              <Plus className="w-3 h-3" /> Add item
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Font Size (px)" value={d.fontSize || 15} type="number" onChange={v => upd({ fontSize: parseInt(v) || 15 })} />
            <ColorInput label="Text Color" value={d.color || "#374151"} onChange={v => upd({ color: v })} />
          </div>
        </div>
      );
    }
    case "divider":
      return (
        <div className="space-y-3 p-3">
          <ColorInput label="Line Color" value={d.color || "#e5e7eb"} onChange={v => upd({ color: v })} />
          <Input label="Vertical Margin (px)" value={d.margin || 24} type="number" onChange={v => upd({ margin: parseInt(v) || 24 })} />
        </div>
      );
    case "spacer":
      return (
        <div className="p-3">
          <Input label="Height (px)" value={d.height || 20} type="number" onChange={v => upd({ height: parseInt(v) || 20 })} />
        </div>
      );
    case "social": {
      const links: SocialLink[] = d.links || [];
      const platforms = ["twitter", "linkedin", "youtube", "instagram", "facebook", "github"];
      return (
        <div className="space-y-3 p-3">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Social Links</label>
            {links.map((link, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select value={link.platform} onChange={e => {
                  const next = [...links]; next[idx] = { ...link, platform: e.target.value as any }; upd({ links: next });
                }} className="h-7 px-2 text-xs border border-slate-300 rounded bg-white text-slate-800 outline-none flex-shrink-0" style={{ width: 100 }}>
                  {platforms.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input type="url" value={link.url} placeholder="https://"
                  onChange={e => { const next = [...links]; next[idx] = { ...link, url: e.target.value }; upd({ links: next }); }}
                  className="flex-1 h-7 px-2 text-xs border border-slate-300 rounded bg-white text-slate-800 outline-none focus:border-blue-400" />
                <button type="button" onClick={() => upd({ links: links.filter((_, i) => i !== idx) })}
                  className="text-red-400 hover:text-red-600 flex-shrink-0"><X className="w-3 h-3" /></button>
              </div>
            ))}
            <button type="button" onClick={() => upd({ links: [...links, { platform: "twitter", url: "" }] })}
              className="w-full h-8 text-xs text-blue-600 border border-blue-200 border-dashed rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5">
              <Plus className="w-3 h-3" /> Add social link
            </button>
          </div>
          <ColorInput label="Icon Color" value={d.iconColor || "#6b7280"} onChange={v => upd({ iconColor: v })} />
        </div>
      );
    }
    case "footer":
      return (
        <div className="space-y-3 p-3">
          <Textarea label="Address / Company Info" value={d.address || ""} onChange={v => upd({ address: v })} rows={2} />
          <Input label="Unsubscribe URL" value={d.unsubscribeUrl || ""} onChange={v => upd({ unsubscribeUrl: v })} placeholder="{{unsubscribe_url}}" />
          <ColorInput label="Text Color" value={d.textColor || "#9ca3af"} onChange={v => upd({ textColor: v })} />
        </div>
      );
    case "columns":
      return (
        <div className="space-y-3 p-3">
          <Textarea label="Left Column HTML" value={d.left || ""} onChange={v => upd({ left: v })} rows={4} />
          <Textarea label="Right Column HTML" value={d.right || ""} onChange={v => upd({ right: v })} rows={4} />
        </div>
      );
    default:
      return <div className="p-3 text-xs text-slate-400">No editor for this block type.</div>;
  }
}

/* ─────────────────────── Block Preview Render ─────────────────────── */
function BlockPreview({ block }: { block: Block }) {
  const d = block.data;
  switch (block.type) {
    case "logo":
      return d.logoUrl
        ? <div className="text-center py-2"><img src={d.logoUrl} alt={d.altText || "Logo"} style={{ height: 40, display: "inline-block" }} /></div>
        : <div className="text-center py-3 text-slate-400 text-xs border-2 border-dashed border-slate-200 rounded">[Logo — paste URL in settings]</div>;
    case "heading": {
      const sz = d.level === 1 ? "text-2xl" : d.level === 2 ? "text-xl" : "text-lg";
      const al = d.align === "center" ? "text-center" : d.align === "right" ? "text-right" : "text-left";
      return <div className={`${sz} font-bold ${al}`} style={{ color: d.color || "#111827" }}>{d.text || "Heading"}</div>;
    }
    case "text": {
      const lines = (d.content || "").split("\n").filter(Boolean);
      return <div className="space-y-2">{lines.map((l: string, i: number) => <p key={i} className="text-sm leading-relaxed" style={{ color: d.color || "#374151" }}>{l}</p>)}</div>;
    }
    case "button":
      return (
        <div style={{ textAlign: d.align || "center" as any }} className="py-2">
          <span className="inline-block px-6 py-3 text-sm font-semibold rounded text-white" style={{ backgroundColor: d.bgColor || "#2563eb", borderRadius: (d.borderRadius || 6) + "px", color: d.textColor || "#ffffff" }}>
            {d.text || "Click Here"}
          </span>
        </div>
      );
    case "image":
      return d.url
        ? <div className="text-center"><img src={d.url} alt={d.altText || ""} style={{ maxWidth: "100%", width: d.width ? `${d.width}%` : "100%", borderRadius: 6, display: "inline-block" }} /></div>
        : <div className="text-center py-6 text-slate-400 text-xs border-2 border-dashed border-slate-200 rounded">[Image — paste URL in settings]</div>;
    case "bulletList": {
      const items: BulletItem[] = d.items || [];
      return (
        <ul className="list-disc pl-5 space-y-2">
          {items.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed" style={{ color: d.color || "#374151" }}>
              {item.boldLabel && <strong>{item.boldLabel} — </strong>}{item.text}
            </li>
          ))}
        </ul>
      );
    }
    case "divider": return <hr style={{ borderColor: d.color || "#e5e7eb", margin: `${d.margin || 24}px 0` }} />;
    case "spacer": return <div style={{ height: d.height || 20 }} />;
    case "social": {
      const links: SocialLink[] = d.links || [];
      return (
        <div className="flex items-center justify-center gap-3 py-2">
          {links.map((l, i) => (
            <a key={i} href={l.url || "#"} target="_blank" rel="noreferrer"
              className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-xs font-semibold transition-colors hover:bg-slate-100"
              style={{ color: d.iconColor || "#6b7280" }}>
              {l.platform[0].toUpperCase()}
            </a>
          ))}
        </div>
      );
    }
    case "footer":
      return (
        <div className="text-center space-y-1 pt-2">
          <p className="text-xs" style={{ color: d.textColor || "#9ca3af" }}>{d.address}</p>
          <p className="text-xs underline" style={{ color: "#6b7280" }}>Unsubscribe</p>
        </div>
      );
    case "columns": {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div className="text-xs text-slate-500 border border-dashed border-slate-200 rounded p-2 min-h-[40px]">Left column</div>
          <div className="text-xs text-slate-500 border border-dashed border-slate-200 rounded p-2 min-h-[40px]">Right column</div>
        </div>
      );
    }
    default: return null;
  }
}

/* ─────────────────────── Empty State ─────────────────────── */
const BLOCK_PALETTE: BlockType[] = ["heading", "text", "button", "image", "bulletList", "logo", "divider", "spacer", "columns", "social", "footer"];

function EmptyState({ onAdd }: { onAdd: (type: BlockType) => void }) {
  return (
    <div className="bg-white rounded-2xl p-6 border-2 border-dashed border-slate-200">
      <div className="text-center mb-5">
        <Layers className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p className="text-sm font-semibold text-slate-600">Start building your email</p>
        <p className="text-xs text-slate-400 mt-0.5">Pick a block type to add to the canvas</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {BLOCK_PALETTE.map(type => {
          const meta = BLOCK_META[type];
          return (
            <button key={type} type="button" onClick={() => onAdd(type)}
              className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all group text-center">
              <span className="text-slate-400 group-hover:text-blue-500 transition-colors">{meta.icon}</span>
              <span className="text-[10px] font-semibold text-slate-600 group-hover:text-blue-700 leading-tight">{meta.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────── Main Component ─────────────────────── */
export interface EmailBlockBuilderProps { value: string; onChange: (html: string) => void; }

export function EmailBlockBuilder({ value, onChange }: EmailBlockBuilderProps) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT_SETTINGS);
  const [selected, setSelected] = useState<string | null>(null);
  const [addingAfter, setAddingAfter] = useState<string | null>(null);
  const [mode, setMode] = useState<"blocks" | "html" | "settings" | "rich">("blocks");
  const [htmlDraft, setHtmlDraft] = useState(value);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const parsed = parseBlocks(value);
    if (parsed) {
      setBlocks(parsed.blocks);
      setSettings(prev => ({ ...prev, ...parsed.settings }));
    } else if (!value || value.trim().length < 20) {
      setBlocks(defaultWelcomeBlocks());
    } else {
      setHtmlDraft(value);
      setMode("html");
    }
  }, []);

  const emit = useCallback((b: Block[], s: EmailSettings) => {
    const html = generateHTML(b, s);
    setHtmlDraft(html);
    onChange(html);
  }, [onChange]);

  const updateBlocks = (next: Block[]) => { setBlocks(next); emit(next, settings); };
  const updateSettings = (patch: Partial<EmailSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    emit(blocks, next);
  };

  const addBlock = (type: BlockType, afterId: string | null | "start") => {
    const newBlock: Block = { id: uid(), type, data: DEFAULT_BLOCK_DATA[type]() };
    const next = [...blocks];
    if (afterId === "start") {
      next.unshift(newBlock);
    } else {
      const idx = afterId ? blocks.findIndex(b => b.id === afterId) : blocks.length - 1;
      next.splice(idx + 1, 0, newBlock);
    }
    setAddingAfter(null);
    setSelected(newBlock.id);
    updateBlocks(next);
  };

  const removeBlock = (id: string) => {
    if (selected === id) setSelected(null);
    updateBlocks(blocks.filter(b => b.id !== id));
  };

  const moveBlock = (id: string, dir: -1 | 1) => {
    const idx = blocks.findIndex(b => b.id === id);
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === blocks.length - 1)) return;
    const next = [...blocks];
    const [item] = next.splice(idx, 1);
    next.splice(idx + dir, 0, item);
    updateBlocks(next);
  };

  const updateBlock = (id: string, data: Record<string, any>) => {
    const next = blocks.map(b => b.id === id ? { ...b, data } : b);
    setBlocks(next);
    emit(next, settings);
  };

  const selectedBlock = blocks.find(b => b.id === selected);

  const BLOCK_TYPES: BlockType[] = ["heading", "text", "button", "image", "bulletList", "logo", "divider", "spacer", "columns", "social", "footer"];

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm text-gray-900">
      {/* Toolbar */}
      <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-slate-200 flex-shrink-0">
          {[
            { id: "rich", icon: <PenLine className="w-3.5 h-3.5" />, label: "Rich Text" },
            { id: "blocks", icon: <Layers className="w-3.5 h-3.5" />, label: "Blocks" },
            { id: "settings", icon: <Settings2 className="w-3.5 h-3.5" />, label: "Settings" },
            { id: "html", icon: <Code2 className="w-3.5 h-3.5" />, label: "HTML" },
          ].map(m => (
            <button key={m.id} type="button" onClick={() => setMode(m.id as any)}
              className={`h-7 px-3 text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${mode === m.id ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
              {m.icon}{m.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <button type="button" onClick={() => { setPreviewHtml(generateHTML(blocks, settings)); setShowPreview(true); }}
            className="h-7 px-3 text-[11px] font-semibold flex items-center gap-1.5 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 transition-colors">
            <Eye className="w-3.5 h-3.5" /> Preview
          </button>
        </div>
      </div>

      <div className="flex h-[540px]">
        {/* Left: Editor canvas */}
        <div className="flex-1 min-w-0 overflow-y-auto flex flex-col">
          {mode === "rich" && (
            <RichTextEmailEditor
              value={htmlDraft}
              onChange={html => { setHtmlDraft(html); onChange(html); }}
              settings={settings}
            />
          )}

          {mode === "blocks" && (
            <div>
              {/* Email canvas */}
              <div className="p-4" style={{ background: settings.bgColor, minHeight: 500 }}>
                <div className="mx-auto" style={{ maxWidth: 520 }}>
                  {/* Add block above everything */}
                  <AddBlockRow onAdd={(t) => addBlock(t, "start")} />

                  {blocks.map((block, idx) => {
                    const isSelected = selected === block.id;
                    const isBeforeCard = block.type === "logo";
                    const isAfterCard = block.type === "social" || block.type === "footer";
                    const wrapClass = isBeforeCard || isAfterCard ? "" : "";

                    return (
                      <div key={block.id}>
                        {/* White card start */}
                        {!isBeforeCard && !isAfterCard && idx > 0 && (blocks[idx - 1]?.type === "logo" || idx === blocks.filter(b => b.type !== "logo").indexOf(block)) && null}

                        <div
                          className={`group relative cursor-pointer transition-all duration-150 ${isSelected ? "ring-2 ring-blue-500 ring-offset-0 rounded-lg z-10" : "hover:ring-1 hover:ring-blue-200 rounded-lg"} ${!isBeforeCard && !isAfterCard ? "bg-white" : ""}`}
                          style={!isBeforeCard && !isAfterCard ? {} : {}}
                          onClick={() => setSelected(isSelected ? null : block.id)}
                        >
                          {/* Block header */}
                          <div className={`flex items-center justify-between px-2 py-1 text-[10px] font-medium rounded-t-lg transition-opacity ${isSelected ? "opacity-100 bg-blue-600 text-white" : "opacity-0 group-hover:opacity-100 bg-slate-100 text-slate-500"}`}>
                            <span className="flex items-center gap-1">{BLOCK_META[block.type].icon}{BLOCK_META[block.type].label}</span>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={e => { e.stopPropagation(); moveBlock(block.id, -1); }}
                                className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/20 transition-colors" title="Move up"><ChevronUp className="w-3 h-3" /></button>
                              <button type="button" onClick={e => { e.stopPropagation(); moveBlock(block.id, 1); }}
                                className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/20 transition-colors" title="Move down"><ChevronDown className="w-3 h-3" /></button>
                              <button type="button" onClick={e => { e.stopPropagation(); removeBlock(block.id); }}
                                className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/20 transition-colors text-red-300" title="Delete"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </div>

                          {/* Block content preview */}
                          <div className={`px-4 py-2 ${!isBeforeCard && !isAfterCard ? "" : ""}`}>
                            <BlockPreview block={block} />
                          </div>

                          {/* Inline editor when selected */}
                          {isSelected && (
                            <div className="border-t border-blue-200 bg-blue-50/40" onClick={e => e.stopPropagation()}>
                              <BlockEditor block={block} onChange={(data) => updateBlock(block.id, data)} />
                            </div>
                          )}
                        </div>

                        {/* Add block row below */}
                        <AddBlockRow onAdd={(t) => addBlock(t, block.id)} />
                      </div>
                    );
                  })}

                  {blocks.length === 0 && (
                    <EmptyState onAdd={(t) => addBlock(t, null)} />
                  )}
                </div>
              </div>
            </div>
          )}

          {mode === "settings" && (
            <div className="p-5 space-y-4 max-w-md">
              <h3 className="text-sm font-semibold text-slate-700">Email Layout Settings</h3>
              <ColorInput label="Page Background Color" value={settings.bgColor} onChange={v => updateSettings({ bgColor: v })} />
              <ColorInput label="Card Background Color" value={settings.cardBgColor} onChange={v => updateSettings({ cardBgColor: v })} />
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Card Padding (px)</label>
                <input type="range" min={16} max={60} step={4} value={settings.cardPadding}
                  onChange={e => updateSettings({ cardPadding: parseInt(e.target.value) })}
                  className="w-full mt-1" />
                <span className="text-xs text-slate-500">{settings.cardPadding}px</span>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Font Family</label>
                <select value={settings.fontFamily} onChange={e => updateSettings({ fontFamily: e.target.value })}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 outline-none">
                  <option value="Arial, Helvetica, sans-serif">Arial (Default)</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="'Times New Roman', Times, serif">Times New Roman</option>
                  <option value="Verdana, Geneva, sans-serif">Verdana</option>
                  <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                  <option value="Tahoma, Geneva, sans-serif">Tahoma</option>
                </select>
              </div>
              <div className="pt-2">
                <button type="button" onClick={() => {
                  if (confirm("This will replace all blocks with the default welcome template. Continue?")) {
                    const nb = defaultWelcomeBlocks();
                    setBlocks(nb);
                    emit(nb, settings);
                    setMode("blocks");
                  }
                }} className="text-xs text-red-500 hover:underline">Reset to default template</button>
              </div>
            </div>
          )}

          {mode === "html" && (
            <div className="p-3 bg-slate-50" style={{ minHeight: 500 }}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500">Raw HTML — edits here will not sync back to blocks</p>
                <button type="button" onClick={() => { onChange(htmlDraft); }}
                  className="h-7 px-3 text-xs bg-blue-600 text-white rounded-lg flex items-center gap-1.5 hover:bg-blue-700">
                  <Check className="w-3 h-3" /> Apply
                </button>
              </div>
              <textarea value={htmlDraft} onChange={e => { setHtmlDraft(e.target.value); onChange(e.target.value); }}
                className="w-full font-mono text-[11px] text-slate-800 bg-white p-4 outline-none resize-none block border border-slate-200 rounded-lg"
                style={{ minHeight: 460 }} spellCheck={false} />
            </div>
          )}
        </div>
      </div>

      {/* Full-screen preview modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 cursor-pointer" onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
              <h3 className="text-sm font-semibold text-slate-800">Email Preview</h3>
              <button type="button" onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <iframe srcDoc={previewHtml} className="w-full rounded-lg border border-slate-200 bg-white"
                style={{ minHeight: 600 }} title="Email Preview" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Add Block Row ─────────────────────── */
function AddBlockRow({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const BLOCK_TYPES: BlockType[] = ["heading", "text", "button", "image", "bulletList", "logo", "divider", "spacer", "columns", "social", "footer"];

  return (
    <div className="relative flex items-center justify-center py-1 group/add" ref={ref}>
      <button type="button" onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all duration-150
          ${open ? "border-blue-500 bg-blue-500 text-white scale-110" : "border-slate-300 bg-white text-slate-400 opacity-0 group-hover/add:opacity-100 hover:border-blue-400 hover:text-blue-500"}`}>
        <Plus className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute top-7 left-1/2 -translate-x-1/2 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl p-2 w-64" onClick={e => e.stopPropagation()}>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-2 pb-1.5">Add block</p>
          <div className="grid grid-cols-2 gap-1">
            {BLOCK_TYPES.map(type => {
              const meta = BLOCK_META[type];
              return (
                <button key={type} type="button"
                  onClick={() => { onAdd(type); setOpen(false); }}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-blue-50 hover:text-blue-700 transition-colors group cursor-pointer">
                  <span className="text-slate-400 group-hover:text-blue-500 flex-shrink-0">{meta.icon}</span>
                  <span className="text-xs font-medium text-slate-700 group-hover:text-blue-700">{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
