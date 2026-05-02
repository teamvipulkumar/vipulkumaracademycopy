import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAdminBase } from "@/lib/auth-context";
import {
  ArrowLeft, Save, Eye, Plus, Trash2, ChevronUp, ChevronDown, Copy,
  Type, Image as ImageIcon, MousePointerClick, Video, Layout, Minus,
  AlignLeft, AlignCenter, AlignRight, GripVertical, Layers, Settings,
  Star, HelpCircle, Timer, List, Columns, Maximize, Move,
  Monitor, Smartphone, LayoutTemplate, PencilLine, X,
  CheckCircle2, ArrowRight, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────── Types ─────────────────────── */
export type BlockType =
  | "hero" | "heading" | "text" | "image" | "button"
  | "video" | "optin-form" | "spacer" | "divider"
  | "two-columns" | "three-columns"
  | "testimonial" | "countdown" | "features" | "faq"
  | "html";

export interface Block {
  id: string;
  type: BlockType;
  props: Record<string, any>;
}

export interface PageContent {
  blocks: Block[];
  bgColor?: string;
  fontFamily?: string;
}

interface StoredPage {
  id: string;
  title: string;
  slug: string;
  type: string;
  status: string;
  createdAt: string;
  views: number;
  content?: PageContent;
}

const STORAGE_KEY = "vka_admin_pages";

function loadPage(id: string): StoredPage | null {
  try {
    const pages: StoredPage[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return pages.find(p => p.id === id) ?? null;
  } catch { return null; }
}

function savePage(updated: StoredPage) {
  try {
    const pages: StoredPage[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    const idx = pages.findIndex(p => p.id === updated.id);
    if (idx >= 0) pages[idx] = updated; else pages.unshift(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  } catch {}
}

/* ─────────────────────── Block Defaults ─────────────────────── */
function defaultProps(type: BlockType): Record<string, any> {
  switch (type) {
    case "hero": return {
      eyebrow: "FREE TRAINING",
      headline: "Learn How to Build a 6-Figure Business Online",
      subheadline: "Discover the proven system used by thousands of successful entrepreneurs — even if you're starting from zero.",
      ctaText: "Get Instant Access →",
      ctaUrl: "#",
      ctaStyle: "primary",
      align: "center",
      bgColor: "#0f172a",
      textColor: "#ffffff",
      paddingY: "80",
      showSubheadline: true,
    };
    case "heading": return { text: "Your Headline Here", level: "h2", align: "left", color: "#ffffff", size: "2xl", bold: true };
    case "text": return { text: "Add your paragraph text here. Click to edit and customize your content.", align: "left", color: "#94a3b8", size: "base" };
    case "image": return { src: "", alt: "Image", align: "center", width: "100", rounded: "lg", caption: "" };
    case "button": return { label: "Click Here", url: "#", style: "primary", align: "center", size: "lg", fullWidth: false };
    case "video": return { url: "", type: "youtube", aspectRatio: "16/9", caption: "" };
    case "optin-form": return {
      headline: "Enter Your Details Below",
      showLastName: true,
      buttonText: "Get Instant Access",
      buttonColor: "#3b82f6",
      bgColor: "#1e293b",
      rounded: true,
    };
    case "spacer": return { height: "40" };
    case "divider": return { style: "solid", color: "#334155", thickness: "1" };
    case "two-columns": return {
      gap: "24",
      col1: [{ id: crypto.randomUUID(), type: "heading" as BlockType, props: { ...defaultProps("heading"), text: "Column 1" } }],
      col2: [{ id: crypto.randomUUID(), type: "heading" as BlockType, props: { ...defaultProps("heading"), text: "Column 2" } }],
    };
    case "three-columns": return {
      gap: "24",
      col1: [{ id: crypto.randomUUID(), type: "heading" as BlockType, props: { ...defaultProps("heading"), text: "Column 1" } }],
      col2: [{ id: crypto.randomUUID(), type: "heading" as BlockType, props: { ...defaultProps("heading"), text: "Column 2" } }],
      col3: [{ id: crypto.randomUUID(), type: "heading" as BlockType, props: { ...defaultProps("heading"), text: "Column 3" } }],
    };
    case "testimonial": return {
      quote: "This training completely changed my life. I went from zero to my first ₹1 lakh month in just 3 months!",
      name: "Rahul Sharma",
      role: "Digital Marketer",
      avatar: "",
      rating: 5,
      bgColor: "#1e293b",
    };
    case "countdown": return {
      label: "Offer Expires In:",
      targetDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      style: "boxes",
      bgColor: "#0f172a",
    };
    case "features": return {
      headline: "What You'll Learn",
      items: [
        "How to start affiliate marketing from scratch",
        "Proven traffic strategies that work in 2026",
        "How to pick winning products every time",
        "Set up your system in just 2 hours",
      ],
      icon: "check",
      iconColor: "#3b82f6",
    };
    case "faq": return {
      headline: "Frequently Asked Questions",
      items: [
        { q: "Is this really free?", a: "Yes, the training is 100% free. No credit card required." },
        { q: "How long is the training?", a: "The training is approximately 45 minutes long and packed with actionable content." },
        { q: "Do I need experience?", a: "No experience needed! This is designed for complete beginners." },
      ],
    };
    case "html": return { code: "<p>Custom HTML block</p>" };
    default: return {};
  }
}

/* ─────────────────────── Block Palette Config ─────────────────────── */
const BLOCK_CATEGORIES = [
  {
    label: "Basic",
    items: [
      { type: "heading" as BlockType, label: "Heading", icon: Type },
      { type: "text" as BlockType, label: "Text", icon: AlignLeft },
      { type: "image" as BlockType, label: "Image", icon: ImageIcon },
      { type: "button" as BlockType, label: "Button", icon: MousePointerClick },
      { type: "spacer" as BlockType, label: "Spacer", icon: Maximize },
      { type: "divider" as BlockType, label: "Divider", icon: Minus },
    ],
  },
  {
    label: "Media",
    items: [
      { type: "video" as BlockType, label: "Video", icon: Video },
      { type: "html" as BlockType, label: "HTML", icon: Layout },
    ],
  },
  {
    label: "Marketing",
    items: [
      { type: "hero" as BlockType, label: "Hero Section", icon: Zap },
      { type: "optin-form" as BlockType, label: "Optin Form", icon: CheckCircle2 },
      { type: "features" as BlockType, label: "Feature List", icon: List },
      { type: "testimonial" as BlockType, label: "Testimonial", icon: Star },
      { type: "countdown" as BlockType, label: "Countdown", icon: Timer },
      { type: "faq" as BlockType, label: "FAQ", icon: HelpCircle },
    ],
  },
  {
    label: "Layout",
    items: [
      { type: "two-columns" as BlockType, label: "2 Columns", icon: Columns },
      { type: "three-columns" as BlockType, label: "3 Columns", icon: LayoutTemplate },
    ],
  },
];

/* ─────────────────────── Block Renderer ─────────────────────── */
export function renderBlock(block: Block, opts?: { editing?: boolean; selected?: boolean }) {
  const p = block.props;
  const isEditing = opts?.editing;

  switch (block.type) {
    case "hero":
      return (
        <div
          style={{ backgroundColor: p.bgColor || "#0f172a", color: p.textColor || "#fff", paddingTop: `${p.paddingY || 80}px`, paddingBottom: `${p.paddingY || 80}px` }}
          className={`px-6 text-${p.align || "center"}`}
        >
          <div className="max-w-3xl mx-auto">
            {p.eyebrow && <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-3">{p.eyebrow}</p>}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight mb-4" style={{ color: p.textColor || "#fff" }}>{p.headline}</h1>
            {p.showSubheadline && p.subheadline && <p className="text-base sm:text-lg opacity-70 mb-8 max-w-2xl mx-auto">{p.subheadline}</p>}
            {p.ctaText && (
              <a href={p.ctaUrl || "#"} className={cn(
                "inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base transition-all",
                p.ctaStyle === "outline" ? "border-2 border-blue-400 text-blue-400 hover:bg-blue-400/10"
                  : p.ctaStyle === "secondary" ? "bg-white text-gray-900 hover:bg-gray-100"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30"
              )}>
                {p.ctaText}
              </a>
            )}
          </div>
        </div>
      );

    case "heading": {
      const Tag = (p.level || "h2") as keyof JSX.IntrinsicElements;
      const sizeMap: Record<string, string> = { xs: "text-sm", sm: "text-base", base: "text-lg", lg: "text-xl", xl: "text-2xl", "2xl": "text-3xl", "3xl": "text-4xl", "4xl": "text-5xl" };
      return (
        <div className={`px-6 py-2 text-${p.align || "left"}`}>
          <Tag className={cn(sizeMap[p.size || "2xl"] || "text-3xl", p.bold !== false ? "font-bold" : "font-normal")} style={{ color: p.color || "#fff" }}>
            {p.text || "Heading"}
          </Tag>
        </div>
      );
    }

    case "text":
      return (
        <div className={`px-6 py-2 text-${p.align || "left"}`}>
          <p className={cn(`text-${p.size || "base"}`)} style={{ color: p.color || "#94a3b8", whiteSpace: "pre-wrap" }}>
            {p.text || "Text block"}
          </p>
        </div>
      );

    case "image":
      return (
        <div className={`px-6 py-4 text-${p.align || "center"}`}>
          {p.src ? (
            <img
              src={p.src}
              alt={p.alt || ""}
              className={cn("inline-block max-w-full", `rounded-${p.rounded || "lg"}`)}
              style={{ width: p.width ? `${p.width}%` : "100%" }}
            />
          ) : (
            <div className="inline-flex items-center justify-center bg-slate-800 border border-dashed border-slate-600 rounded-lg" style={{ width: `${p.width || 100}%`, height: "160px" }}>
              <div className="text-center text-slate-500">
                <ImageIcon className="w-8 h-8 mx-auto mb-2" />
                <p className="text-xs">Add image URL in settings</p>
              </div>
            </div>
          )}
          {p.caption && <p className="text-xs text-slate-500 mt-2">{p.caption}</p>}
        </div>
      );

    case "button":
      return (
        <div className={`px-6 py-4 text-${p.align || "center"}`}>
          <a
            href={p.url || "#"}
            className={cn(
              "inline-flex items-center gap-2 font-bold rounded-xl transition-all",
              p.size === "sm" ? "px-4 py-2 text-sm" : p.size === "xl" ? "px-10 py-5 text-lg" : "px-8 py-4 text-base",
              p.fullWidth ? "w-full justify-center" : "",
              p.style === "outline" ? "border-2 border-blue-500 text-blue-400 hover:bg-blue-500/10"
                : p.style === "secondary" ? "bg-slate-700 text-white hover:bg-slate-600"
                : p.style === "ghost" ? "text-blue-400 hover:text-blue-300"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30"
            )}
            onClick={isEditing ? (e) => e.preventDefault() : undefined}
          >
            {p.label || "Click Here"}
          </a>
        </div>
      );

    case "video": {
      const embedUrl = getEmbedUrl(p.url || "", p.type || "youtube");
      return (
        <div className="px-6 py-4">
          {embedUrl ? (
            <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ paddingTop: p.aspectRatio === "4/3" ? "75%" : p.aspectRatio === "1/1" ? "100%" : "56.25%" }}>
              <iframe
                src={embedUrl}
                className="absolute inset-0 w-full h-full"
                allowFullScreen
                title="Video"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center bg-slate-800 border border-dashed border-slate-600 rounded-xl" style={{ height: "240px" }}>
              <div className="text-center text-slate-500">
                <Video className="w-10 h-10 mx-auto mb-2" />
                <p className="text-sm">Paste YouTube or Vimeo URL in settings</p>
              </div>
            </div>
          )}
          {p.caption && <p className="text-xs text-slate-500 mt-2 text-center">{p.caption}</p>}
        </div>
      );
    }

    case "optin-form":
      return (
        <div className="px-6 py-8" style={{ backgroundColor: p.bgColor || "#1e293b" }}>
          <div className="max-w-lg mx-auto space-y-4">
            {p.headline && <h3 className="text-xl font-bold text-white text-center">{p.headline}</h3>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input placeholder="First Name *" className="px-4 py-3 rounded-lg bg-slate-700/60 border border-slate-600 text-white placeholder:text-slate-500 text-sm outline-none w-full" readOnly={isEditing} />
              {p.showLastName && <input placeholder="Last Name" className="px-4 py-3 rounded-lg bg-slate-700/60 border border-slate-600 text-white placeholder:text-slate-500 text-sm outline-none w-full" readOnly={isEditing} />}
            </div>
            <input placeholder="Email Address *" type="email" className="w-full px-4 py-3 rounded-lg bg-slate-700/60 border border-slate-600 text-white placeholder:text-slate-500 text-sm outline-none" readOnly={isEditing} />
            <button
              className={cn("w-full py-4 rounded-xl font-bold text-white text-base transition-all", p.rounded ? "rounded-xl" : "rounded")}
              style={{ backgroundColor: p.buttonColor || "#3b82f6" }}
              onClick={isEditing ? (e) => e.preventDefault() : undefined}
            >
              {p.buttonText || "Get Instant Access"}
            </button>
          </div>
        </div>
      );

    case "spacer":
      return <div style={{ height: `${p.height || 40}px` }} />;

    case "divider":
      return (
        <div className="px-6 py-2">
          <hr style={{ borderStyle: p.style || "solid", borderColor: p.color || "#334155", borderTopWidth: `${p.thickness || 1}px` }} />
        </div>
      );

    case "two-columns":
      return (
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: `${p.gap || 24}px` }}>
            <div className="min-h-[60px] border border-dashed border-slate-700/50 rounded-lg overflow-hidden">
              {(p.col1 || []).map((b: Block) => renderBlock(b, opts))}
            </div>
            <div className="min-h-[60px] border border-dashed border-slate-700/50 rounded-lg overflow-hidden">
              {(p.col2 || []).map((b: Block) => renderBlock(b, opts))}
            </div>
          </div>
        </div>
      );

    case "three-columns":
      return (
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: `${p.gap || 24}px` }}>
            {["col1","col2","col3"].map(col => (
              <div key={col} className="min-h-[60px] border border-dashed border-slate-700/50 rounded-lg overflow-hidden">
                {(p[col] || []).map((b: Block) => renderBlock(b, opts))}
              </div>
            ))}
          </div>
        </div>
      );

    case "testimonial":
      return (
        <div className="px-6 py-4">
          <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: p.bgColor || "#1e293b" }}>
            {p.rating > 0 && (
              <div className="flex gap-1 mb-4">
                {Array.from({ length: p.rating || 5 }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
            )}
            <p className="text-white/90 text-base italic leading-relaxed mb-6">"{p.quote}"</p>
            <div className="flex items-center gap-3">
              {p.avatar ? (
                <img src={p.avatar} alt={p.name} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-600/30 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-sm">
                  {(p.name || "A")[0]}
                </div>
              )}
              <div>
                <p className="font-semibold text-white text-sm">{p.name}</p>
                {p.role && <p className="text-slate-400 text-xs">{p.role}</p>}
              </div>
            </div>
          </div>
        </div>
      );

    case "countdown":
      return <CountdownBlock props={p} />;

    case "features":
      return (
        <div className="px-6 py-6">
          {p.headline && <h3 className="text-xl font-bold text-white mb-5">{p.headline}</h3>}
          <ul className="space-y-3">
            {(p.items || []).map((item: string, i: number) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: (p.iconColor || "#3b82f6") + "22" }}>
                  <CheckCircle2 className="w-3.5 h-3.5" style={{ color: p.iconColor || "#3b82f6" }} />
                </span>
                <span className="text-slate-300 text-sm leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    case "faq":
      return <FaqBlock props={p} />;

    case "html":
      return (
        <div className="px-6 py-4" dangerouslySetInnerHTML={{ __html: p.code || "" }} />
      );

    default:
      return <div className="px-6 py-4 text-slate-500 text-xs italic">Unknown block type: {block.type}</div>;
  }
}

function getEmbedUrl(url: string, type: string) {
  if (!url) return "";
  if (type === "youtube") {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (match) return `https://www.youtube.com/embed/${match[1]}`;
  }
  if (type === "vimeo") {
    const match = url.match(/vimeo\.com\/(\d+)/);
    if (match) return `https://player.vimeo.com/video/${match[1]}`;
  }
  return url.includes("embed") ? url : "";
}

function CountdownBlock({ props: p }: { props: Record<string, any> }) {
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });
  useEffect(() => {
    function calc() {
      const diff = new Date(p.targetDate).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft({ d: 0, h: 0, m: 0, s: 0 }); return; }
      setTimeLeft({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
    }
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [p.targetDate]);

  return (
    <div className="px-6 py-8" style={{ backgroundColor: p.bgColor || "#0f172a" }}>
      {p.label && <p className="text-center text-slate-400 text-sm font-semibold uppercase tracking-wider mb-4">{p.label}</p>}
      <div className="flex items-center justify-center gap-3">
        {[{ v: timeLeft.d, l: "Days" }, { v: timeLeft.h, l: "Hours" }, { v: timeLeft.m, l: "Minutes" }, { v: timeLeft.s, l: "Seconds" }].map(({ v, l }) => (
          <div key={l} className="flex flex-col items-center">
            <div className="w-16 h-16 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl font-bold text-white tabular-nums">{String(v).padStart(2, "0")}</span>
            </div>
            <span className="text-xs text-slate-500 mt-1">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqBlock({ props: p }: { props: Record<string, any> }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="px-6 py-6">
      {p.headline && <h3 className="text-xl font-bold text-white mb-5">{p.headline}</h3>}
      <div className="space-y-2">
        {(p.items || []).map((item: { q: string; a: string }, i: number) => (
          <div key={i} className="border border-slate-700 rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-4 text-left text-sm font-medium text-white hover:bg-slate-800 transition-colors"
              onClick={() => setOpen(open === i ? null : i)}
            >
              <span>{item.q}</span>
              <span className="ml-4 shrink-0 text-slate-400">{open === i ? "−" : "+"}</span>
            </button>
            {open === i && (
              <div className="px-5 pb-4 text-sm text-slate-400 border-t border-slate-700/50">
                <p className="pt-3">{item.a}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────── Properties Panel ─────────────────────── */
function PropInput({ label, value, onChange, type = "text", placeholder = "" }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-400">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"
      />
    </div>
  );
}

function PropSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-400">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-700">
          {options.map(o => <SelectItem key={o.value} value={o.value} className="text-xs text-slate-200">{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function PropTextarea({ label, value, onChange, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-400">{label}</Label>
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        className="text-xs bg-slate-800 border-slate-700 text-slate-200 resize-none"
      />
    </div>
  );
}

function PropToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={cn("w-9 h-5 rounded-full transition-colors relative", value ? "bg-blue-600" : "bg-slate-700")}
      >
        <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", value ? "translate-x-4" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

function AlignButtons({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-400">Alignment</Label>
      <div className="flex gap-1">
        {[{ v: "left", icon: AlignLeft }, { v: "center", icon: AlignCenter }, { v: "right", icon: AlignRight }].map(({ v, icon: Icon }) => (
          <button key={v} onClick={() => onChange(v)}
            className={cn("flex-1 h-8 flex items-center justify-center rounded border transition-colors",
              value === v ? "bg-blue-600/20 border-blue-500 text-blue-400" : "border-slate-700 text-slate-500 hover:border-slate-600"
            )}>
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockProperties({ block, onChange }: { block: Block; onChange: (props: Record<string, any>) => void }) {
  const p = block.props;
  const set = (key: string, val: any) => onChange({ ...p, [key]: val });

  const section = (title: string, children: React.ReactNode) => (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{title}</p>
      {children}
    </div>
  );

  switch (block.type) {
    case "hero":
      return (
        <div className="space-y-5">
          {section("Content", <>
            <PropInput label="Eyebrow Text" value={p.eyebrow || ""} onChange={v => set("eyebrow", v)} placeholder="FREE TRAINING" />
            <PropTextarea label="Headline" value={p.headline || ""} onChange={v => set("headline", v)} rows={3} />
            <PropToggle label="Show Subheadline" value={p.showSubheadline ?? true} onChange={v => set("showSubheadline", v)} />
            {p.showSubheadline && <PropTextarea label="Subheadline" value={p.subheadline || ""} onChange={v => set("subheadline", v)} rows={2} />}
          </>)}
          {section("CTA Button", <>
            <PropInput label="Button Text" value={p.ctaText || ""} onChange={v => set("ctaText", v)} placeholder="Get Instant Access" />
            <PropInput label="Button URL" value={p.ctaUrl || ""} onChange={v => set("ctaUrl", v)} placeholder="#" />
            <PropSelect label="Button Style" value={p.ctaStyle || "primary"} onChange={v => set("ctaStyle", v)} options={[
              { value: "primary", label: "Primary (Blue)" }, { value: "secondary", label: "Secondary (White)" }, { value: "outline", label: "Outline" }
            ]} />
          </>)}
          {section("Style", <>
            <AlignButtons value={p.align || "center"} onChange={v => set("align", v)} />
            <PropInput label="Padding Y (px)" value={p.paddingY || "80"} onChange={v => set("paddingY", v)} type="number" />
            <PropInput label="Background Color" value={p.bgColor || "#0f172a"} onChange={v => set("bgColor", v)} type="color" />
            <PropInput label="Text Color" value={p.textColor || "#ffffff"} onChange={v => set("textColor", v)} type="color" />
          </>)}
        </div>
      );

    case "heading":
      return (
        <div className="space-y-5">
          {section("Content", <>
            <PropTextarea label="Heading Text" value={p.text || ""} onChange={v => set("text", v)} rows={2} />
          </>)}
          {section("Style", <>
            <PropSelect label="Tag" value={p.level || "h2"} onChange={v => set("level", v)} options={
              ["h1","h2","h3","h4","h5","h6"].map(h => ({ value: h, label: h.toUpperCase() }))
            } />
            <PropSelect label="Size" value={p.size || "2xl"} onChange={v => set("size", v)} options={[
              { value: "sm", label: "Small" }, { value: "base", label: "Base" }, { value: "lg", label: "Large" },
              { value: "xl", label: "XL" }, { value: "2xl", label: "2XL" }, { value: "3xl", label: "3XL" }, { value: "4xl", label: "4XL" }
            ]} />
            <AlignButtons value={p.align || "left"} onChange={v => set("align", v)} />
            <PropToggle label="Bold" value={p.bold ?? true} onChange={v => set("bold", v)} />
            <PropInput label="Color" value={p.color || "#ffffff"} onChange={v => set("color", v)} type="color" />
          </>)}
        </div>
      );

    case "text":
      return (
        <div className="space-y-5">
          {section("Content", <PropTextarea label="Text" value={p.text || ""} onChange={v => set("text", v)} rows={5} />)}
          {section("Style", <>
            <PropSelect label="Size" value={p.size || "base"} onChange={v => set("size", v)} options={[
              { value: "xs", label: "XS" }, { value: "sm", label: "Small" }, { value: "base", label: "Base" },
              { value: "lg", label: "Large" }, { value: "xl", label: "XL" }
            ]} />
            <AlignButtons value={p.align || "left"} onChange={v => set("align", v)} />
            <PropInput label="Color" value={p.color || "#94a3b8"} onChange={v => set("color", v)} type="color" />
          </>)}
        </div>
      );

    case "image":
      return (
        <div className="space-y-5">
          {section("Image", <>
            <PropInput label="Image URL" value={p.src || ""} onChange={v => set("src", v)} placeholder="https://..." />
            <PropInput label="Alt Text" value={p.alt || ""} onChange={v => set("alt", v)} placeholder="Image description" />
            <PropInput label="Caption" value={p.caption || ""} onChange={v => set("caption", v)} placeholder="Optional caption" />
          </>)}
          {section("Style", <>
            <AlignButtons value={p.align || "center"} onChange={v => set("align", v)} />
            <PropInput label="Width (%)" value={p.width || "100"} onChange={v => set("width", v)} type="number" />
            <PropSelect label="Rounded" value={p.rounded || "lg"} onChange={v => set("rounded", v)} options={[
              { value: "none", label: "None" }, { value: "sm", label: "Small" }, { value: "lg", label: "Large" },
              { value: "xl", label: "XL" }, { value: "2xl", label: "2XL" }, { value: "full", label: "Full (Circle)" }
            ]} />
          </>)}
        </div>
      );

    case "button":
      return (
        <div className="space-y-5">
          {section("Button", <>
            <PropInput label="Label" value={p.label || ""} onChange={v => set("label", v)} placeholder="Click Here" />
            <PropInput label="URL" value={p.url || ""} onChange={v => set("url", v)} placeholder="https://..." />
          </>)}
          {section("Style", <>
            <PropSelect label="Style" value={p.style || "primary"} onChange={v => set("style", v)} options={[
              { value: "primary", label: "Primary" }, { value: "secondary", label: "Secondary" },
              { value: "outline", label: "Outline" }, { value: "ghost", label: "Ghost" }
            ]} />
            <PropSelect label="Size" value={p.size || "lg"} onChange={v => set("size", v)} options={[
              { value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }, { value: "xl", label: "XL" }
            ]} />
            <AlignButtons value={p.align || "center"} onChange={v => set("align", v)} />
            <PropToggle label="Full Width" value={p.fullWidth ?? false} onChange={v => set("fullWidth", v)} />
          </>)}
        </div>
      );

    case "video":
      return (
        <div className="space-y-5">
          {section("Video", <>
            <PropSelect label="Source" value={p.type || "youtube"} onChange={v => set("type", v)} options={[
              { value: "youtube", label: "YouTube" }, { value: "vimeo", label: "Vimeo" }, { value: "custom", label: "Custom Embed URL" }
            ]} />
            <PropInput label="Video URL" value={p.url || ""} onChange={v => set("url", v)} placeholder="https://www.youtube.com/watch?v=..." />
            <PropInput label="Caption" value={p.caption || ""} onChange={v => set("caption", v)} placeholder="Optional caption" />
          </>)}
          {section("Style", <>
            <PropSelect label="Aspect Ratio" value={p.aspectRatio || "16/9"} onChange={v => set("aspectRatio", v)} options={[
              { value: "16/9", label: "16:9 (Widescreen)" }, { value: "4/3", label: "4:3" }, { value: "1/1", label: "1:1 (Square)" }
            ]} />
          </>)}
        </div>
      );

    case "optin-form":
      return (
        <div className="space-y-5">
          {section("Form", <>
            <PropInput label="Headline" value={p.headline || ""} onChange={v => set("headline", v)} placeholder="Enter Your Details" />
            <PropInput label="Button Text" value={p.buttonText || ""} onChange={v => set("buttonText", v)} placeholder="Get Instant Access" />
            <PropToggle label="Show Last Name Field" value={p.showLastName ?? true} onChange={v => set("showLastName", v)} />
          </>)}
          {section("Style", <>
            <PropInput label="Background Color" value={p.bgColor || "#1e293b"} onChange={v => set("bgColor", v)} type="color" />
            <PropInput label="Button Color" value={p.buttonColor || "#3b82f6"} onChange={v => set("buttonColor", v)} type="color" />
            <PropToggle label="Rounded Corners" value={p.rounded ?? true} onChange={v => set("rounded", v)} />
          </>)}
        </div>
      );

    case "spacer":
      return section("Spacer", <PropInput label="Height (px)" value={p.height || "40"} onChange={v => set("height", v)} type="number" />);

    case "divider":
      return (
        <div className="space-y-5">
          {section("Divider", <>
            <PropSelect label="Line Style" value={p.style || "solid"} onChange={v => set("style", v)} options={[
              { value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }
            ]} />
            <PropInput label="Color" value={p.color || "#334155"} onChange={v => set("color", v)} type="color" />
            <PropInput label="Thickness (px)" value={p.thickness || "1"} onChange={v => set("thickness", v)} type="number" />
          </>)}
        </div>
      );

    case "testimonial":
      return (
        <div className="space-y-5">
          {section("Testimonial", <>
            <PropTextarea label="Quote" value={p.quote || ""} onChange={v => set("quote", v)} rows={4} />
            <PropInput label="Name" value={p.name || ""} onChange={v => set("name", v)} placeholder="John Doe" />
            <PropInput label="Role / Title" value={p.role || ""} onChange={v => set("role", v)} placeholder="Digital Marketer" />
            <PropInput label="Avatar URL" value={p.avatar || ""} onChange={v => set("avatar", v)} placeholder="https://..." />
          </>)}
          {section("Style", <>
            <PropSelect label="Rating" value={String(p.rating ?? 5)} onChange={v => set("rating", Number(v))} options={
              [0,1,2,3,4,5].map(n => ({ value: String(n), label: n === 0 ? "No Rating" : `${n} Stars` }))
            } />
            <PropInput label="Background Color" value={p.bgColor || "#1e293b"} onChange={v => set("bgColor", v)} type="color" />
          </>)}
        </div>
      );

    case "countdown":
      return (
        <div className="space-y-5">
          {section("Countdown", <>
            <PropInput label="Label" value={p.label || ""} onChange={v => set("label", v)} placeholder="Offer Expires In:" />
            <PropInput label="Target Date & Time" value={p.targetDate ? p.targetDate.slice(0, 16) : ""} onChange={v => set("targetDate", v)} type="datetime-local" />
          </>)}
          {section("Style", <PropInput label="Background Color" value={p.bgColor || "#0f172a"} onChange={v => set("bgColor", v)} type="color" />)}
        </div>
      );

    case "features":
      return (
        <div className="space-y-5">
          {section("Features", <>
            <PropInput label="Headline" value={p.headline || ""} onChange={v => set("headline", v)} placeholder="What You'll Learn" />
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Items (one per line)</Label>
              <Textarea
                value={(p.items || []).join("\n")}
                onChange={e => set("items", e.target.value.split("\n").filter(Boolean))}
                rows={6}
                className="text-xs bg-slate-800 border-slate-700 text-slate-200 resize-none"
                placeholder="Feature one&#10;Feature two"
              />
            </div>
          </>)}
          {section("Style", <PropInput label="Icon Color" value={p.iconColor || "#3b82f6"} onChange={v => set("iconColor", v)} type="color" />)}
        </div>
      );

    case "faq":
      return (
        <div className="space-y-5">
          {section("FAQ", <>
            <PropInput label="Headline" value={p.headline || ""} onChange={v => set("headline", v)} placeholder="Frequently Asked Questions" />
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">FAQ Items</Label>
              {(p.items || []).map((item: { q: string; a: string }, i: number) => (
                <div key={i} className="p-3 bg-slate-800 rounded-lg space-y-2 border border-slate-700">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500 font-medium">#{i + 1}</span>
                    <button
                      onClick={() => set("items", (p.items || []).filter((_: any, idx: number) => idx !== i))}
                      className="w-5 h-5 flex items-center justify-center text-slate-600 hover:text-red-400"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <Input
                    value={item.q}
                    onChange={e => {
                      const items = [...(p.items || [])];
                      items[i] = { ...items[i], q: e.target.value };
                      set("items", items);
                    }}
                    placeholder="Question"
                    className="h-7 text-xs bg-slate-900 border-slate-700 text-slate-200"
                  />
                  <Textarea
                    value={item.a}
                    onChange={e => {
                      const items = [...(p.items || [])];
                      items[i] = { ...items[i], a: e.target.value };
                      set("items", items);
                    }}
                    rows={2}
                    placeholder="Answer"
                    className="text-xs bg-slate-900 border-slate-700 text-slate-200 resize-none"
                  />
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs border-slate-700 text-slate-400 hover:text-slate-200"
                onClick={() => set("items", [...(p.items || []), { q: "New Question?", a: "Answer goes here." }])}
              >
                <Plus className="w-3 h-3 mr-1" />Add FAQ Item
              </Button>
            </div>
          </>)}
        </div>
      );

    case "html":
      return section("HTML", <PropTextarea label="Custom HTML" value={p.code || ""} onChange={v => set("code", v)} rows={8} />);

    case "two-columns":
    case "three-columns":
      return section("Layout", <PropInput label="Column Gap (px)" value={p.gap || "24"} onChange={v => set("gap", v)} type="number" />);

    default:
      return <p className="text-xs text-slate-500">No properties for this block.</p>;
  }
}

/* ─────────────────────── Main Builder ─────────────────────── */
export default function PageBuilderPage() {
  // Page-builder is mounted under both `/admin/pages/:id/builder` and
  // `/staff/pages/:id/builder` (see App.tsx). Match either prefix so the
  // route param resolves regardless of which one the user landed on.
  const [, paramsAdmin] = useRoute("/admin/pages/:id/builder");
  const [, paramsStaff] = useRoute("/staff/pages/:id/builder");
  const params = paramsAdmin ?? paramsStaff;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const adminBase = useAdminBase();

  const pageId = params?.id ?? "";
  const [page, setPage] = useState<StoredPage | null>(() => loadPage(pageId));
  const [blocks, setBlocks] = useState<Block[]>(() => page?.content?.blocks ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<"elements" | "layers">("elements");

  const dragSrcIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null;

  useEffect(() => {
    if (!page) {
      toast({ variant: "destructive", title: "Page not found" });
      setLocation(`${adminBase}/pages`);
    }
  }, [page]);

  function addBlock(type: BlockType) {
    const newBlock: Block = { id: crypto.randomUUID(), type, props: defaultProps(type) };
    if (selectedId) {
      const idx = blocks.findIndex(b => b.id === selectedId);
      const next = [...blocks];
      next.splice(idx + 1, 0, newBlock);
      setBlocks(next);
    } else {
      setBlocks(prev => [...prev, newBlock]);
    }
    setSelectedId(newBlock.id);
    setDirty(true);
  }

  function updateBlock(id: string, props: Record<string, any>) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, props } : b));
    setDirty(true);
  }

  function deleteBlock(id: string) {
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (selectedId === id) setSelectedId(null);
    setDirty(true);
  }

  function duplicateBlock(id: string) {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    const copy: Block = { ...blocks[idx], id: crypto.randomUUID(), props: { ...blocks[idx].props } };
    const next = [...blocks];
    next.splice(idx + 1, 0, copy);
    setBlocks(next);
    setSelectedId(copy.id);
    setDirty(true);
  }

  function moveBlock(id: string, dir: -1 | 1) {
    const idx = blocks.findIndex(b => b.id === id);
    const next = [...blocks];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setBlocks(next);
    setDirty(true);
  }

  function handleDragStart(idx: number) { dragSrcIdx.current = idx; }
  function handleDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); dragOverIdx.current = idx; }
  function handleDrop() {
    const src = dragSrcIdx.current;
    const over = dragOverIdx.current;
    if (src === null || over === null || src === over) return;
    const next = [...blocks];
    const [moved] = next.splice(src, 1);
    next.splice(over, 0, moved);
    setBlocks(next);
    dragSrcIdx.current = null;
    dragOverIdx.current = null;
    setDirty(true);
  }

  function handleSave() {
    if (!page) return;
    const updated = { ...page, content: { blocks } };
    savePage(updated);
    setPage(updated);
    setDirty(false);
    toast({ title: "Page saved!" });
  }

  function handlePreview() {
    const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
    window.open(`${BASE}/p/${page?.slug}`, "_blank");
  }

  if (!page) return null;

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-slate-200 overflow-hidden">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-slate-800 bg-[#161b22] shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-slate-400 hover:text-slate-200 px-2"
            onClick={() => setLocation(`${adminBase}/pages`)}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs hidden sm:inline">Pages</span>
          </Button>
          <div className="w-px h-5 bg-slate-700" />
          <div className="flex items-center gap-2">
            <PencilLine className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-sm font-medium text-slate-200 max-w-[200px] truncate">{page.title}</span>
            {dirty && <span className="text-[10px] text-yellow-400 font-medium">(unsaved)</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Viewport toggle */}
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewport("desktop")}
              className={cn("p-1.5 rounded-md transition-colors", viewport === "desktop" ? "bg-slate-700 text-blue-400" : "text-slate-500 hover:text-slate-300")}
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewport("mobile")}
              className={cn("p-1.5 rounded-md transition-colors", viewport === "mobile" ? "bg-slate-700 text-blue-400" : "text-slate-500 hover:text-slate-300")}
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>

          <Button size="sm" variant="outline" className="h-8 text-xs border-slate-700 text-slate-400 gap-1.5" onClick={handlePreview}>
            <Eye className="w-3.5 h-3.5" />Preview
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={!dirty}>
            <Save className="w-3.5 h-3.5" />Save
          </Button>
        </div>
      </div>

      {/* ── 3-Column Layout ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Panel: Block Palette / Layers ── */}
        <div className="w-64 border-r border-slate-800 bg-[#161b22] flex flex-col overflow-hidden shrink-0">
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
            <TabsList className="w-full bg-transparent border-b border-slate-800 rounded-none h-10 px-2 gap-1">
              <TabsTrigger value="elements" className="flex-1 h-7 text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-blue-400 rounded">
                <Plus className="w-3 h-3 mr-1" />Elements
              </TabsTrigger>
              <TabsTrigger value="layers" className="flex-1 h-7 text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-blue-400 rounded">
                <Layers className="w-3 h-3 mr-1" />Layers
              </TabsTrigger>
            </TabsList>

            <TabsContent value="elements" className="flex-1 overflow-y-auto m-0 p-3 space-y-4">
              {BLOCK_CATEGORIES.map(cat => (
                <div key={cat.label}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">{cat.label}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {cat.items.map(item => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.type}
                          onClick={() => addBlock(item.type)}
                          className="flex flex-col items-center gap-1.5 p-2.5 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-blue-500/50 hover:text-blue-400 transition-all text-slate-400 group"
                        >
                          <Icon className="w-4 h-4 group-hover:text-blue-400" />
                          <span className="text-[10px] font-medium leading-none">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="layers" className="flex-1 overflow-y-auto m-0 p-2 space-y-0.5">
              {blocks.length === 0 ? (
                <p className="text-xs text-slate-600 text-center py-8">No blocks yet.<br />Add elements from the Elements tab.</p>
              ) : blocks.map((block, idx) => {
                const cat = BLOCK_CATEGORIES.flatMap(c => c.items).find(i => i.type === block.type);
                const Icon = cat?.icon ?? Layout;
                return (
                  <button
                    key={block.id}
                    onClick={() => setSelectedId(block.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors",
                      selectedId === block.id ? "bg-blue-600/20 text-blue-400" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    )}
                  >
                    <GripVertical className="w-3 h-3 text-slate-600 shrink-0" />
                    <Icon className="w-3 h-3 shrink-0" />
                    <span className="text-xs truncate">{cat?.label ?? block.type}</span>
                    <span className="ml-auto text-[10px] text-slate-700">#{idx + 1}</span>
                  </button>
                );
              })}
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Canvas ── */}
        <div
          className="flex-1 overflow-y-auto bg-slate-900/50 flex justify-center"
          style={{ backgroundImage: "radial-gradient(circle, #1e293b 1px, transparent 1px)", backgroundSize: "24px 24px" }}
          onClick={() => setSelectedId(null)}
        >
          <div
            className={cn(
              "my-6 shadow-2xl shadow-black/60 bg-[#0d1117] overflow-hidden transition-all duration-300",
              viewport === "mobile" ? "w-[390px] rounded-2xl" : "w-full max-w-4xl rounded-xl"
            )}
            onClick={e => e.stopPropagation()}
          >
            {blocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-600">
                <LayoutTemplate className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-sm font-medium">Your canvas is empty</p>
                <p className="text-xs mt-1 opacity-60">Click elements on the left to add them</p>
              </div>
            ) : (
              blocks.map((block, idx) => (
                <div
                  key={block.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDrop={handleDrop}
                  className={cn(
                    "relative group transition-all",
                    selectedId === block.id ? "ring-2 ring-blue-500 ring-inset" : "hover:ring-1 hover:ring-blue-500/40 hover:ring-inset"
                  )}
                  onClick={(e) => { e.stopPropagation(); setSelectedId(block.id); }}
                >
                  {/* Block Actions */}
                  <div className={cn(
                    "absolute top-1.5 right-1.5 flex items-center gap-0.5 z-10 transition-opacity",
                    selectedId === block.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}>
                    <button
                      onClick={e => { e.stopPropagation(); moveBlock(block.id, -1); }}
                      className="w-6 h-6 flex items-center justify-center bg-slate-800/90 border border-slate-700 rounded text-slate-400 hover:text-white hover:bg-slate-700"
                      title="Move Up"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); moveBlock(block.id, 1); }}
                      className="w-6 h-6 flex items-center justify-center bg-slate-800/90 border border-slate-700 rounded text-slate-400 hover:text-white hover:bg-slate-700"
                      title="Move Down"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); duplicateBlock(block.id); }}
                      className="w-6 h-6 flex items-center justify-center bg-slate-800/90 border border-slate-700 rounded text-slate-400 hover:text-white hover:bg-slate-700"
                      title="Duplicate"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); deleteBlock(block.id); }}
                      className="w-6 h-6 flex items-center justify-center bg-red-900/80 border border-red-700 rounded text-red-400 hover:text-red-300 hover:bg-red-800"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Drag handle */}
                  <div className={cn(
                    "absolute top-1/2 left-1.5 -translate-y-1/2 w-5 flex flex-col items-center gap-0.5 z-10 transition-opacity cursor-grab active:cursor-grabbing",
                    selectedId === block.id ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                  )}>
                    <GripVertical className="w-4 h-4 text-slate-500" />
                  </div>

                  {/* Block type label */}
                  {selectedId === block.id && (
                    <div className="absolute -top-0 left-0 z-10">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-600 text-white px-2 py-0.5 rounded-br">
                        {BLOCK_CATEGORIES.flatMap(c => c.items).find(i => i.type === block.type)?.label ?? block.type}
                      </span>
                    </div>
                  )}

                  {renderBlock(block, { editing: true, selected: selectedId === block.id })}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Right Panel: Properties ── */}
        <div className="w-72 border-l border-slate-800 bg-[#161b22] flex flex-col overflow-hidden shrink-0">
          <div className="flex items-center gap-2 px-4 h-10 border-b border-slate-800">
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {selectedBlock ? `${BLOCK_CATEGORIES.flatMap(c => c.items).find(i => i.type === selectedBlock.type)?.label ?? selectedBlock.type} Settings` : "Properties"}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {selectedBlock ? (
              <BlockProperties
                block={selectedBlock}
                onChange={props => updateBlock(selectedBlock.id, props)}
              />
            ) : (
              <div className="text-center py-12 text-slate-600">
                <Move className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-xs">Click a block on the canvas<br />to edit its properties.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
