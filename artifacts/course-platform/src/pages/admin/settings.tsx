import { useState, useEffect, useRef, useCallback } from "react";
import { useGetAdminSettings, getGetAdminSettingsQueryKey, useUpdateAdminSettings } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Chrome, Info, Construction, Check, Upload, Globe, ImageIcon, Loader2, FolderOpen, CheckCircle2 } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const API_BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

type MediaFile = { filename: string; url: string; size: number; uploadedAt: string; mimetype: string; type: string };

function MediaPickerDialog({
  open, onClose, onSelect, uploadFn, accept, title,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  uploadFn: (file: File) => Promise<string | null>;
  accept?: string;
  title: string;
}) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) { setSelected(null); return; }
    setLoading(true);
    fetch(`${API_BASE_URL}/api/upload/admin/files`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((data: MediaFile[]) => setFiles(data.filter(f => f.type === "image")))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [open]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadFn(file);
    if (url) {
      const newFile: MediaFile = {
        filename: url.split("/").pop() ?? "",
        url,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        mimetype: file.type,
        type: "image",
      };
      setFiles(prev => [newFile, ...prev]);
      setSelected(url);
    } else {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleConfirm = () => {
    if (selected) { onSelect(selected); onClose(); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl w-full p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="text-base flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-primary" />{title}
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Upload from computer */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Select an existing file or upload a new one</p>
            <input ref={fileRef} type="file" accept={accept ?? "image/*"} className="hidden" onChange={handleUpload} />
            <Button size="sm" variant="outline" className="gap-1.5 cursor-pointer" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? "Uploading…" : "Upload from Computer"}
            </Button>
          </div>

          {/* File grid */}
          {loading ? (
            <div className="grid grid-cols-4 gap-3">
              {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="aspect-square rounded-lg bg-card animate-pulse" />)}
            </div>
          ) : files.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No images uploaded yet</p>
              <p className="text-xs mt-1">Use the button above to upload your first file</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {files.map(f => {
                const isSelected = selected === f.url;
                return (
                  <button
                    key={f.filename}
                    onClick={() => setSelected(isSelected ? null : f.url)}
                    className={`relative aspect-square rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
                      isSelected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <img
                      src={`${API_BASE_URL}${f.url}`}
                      alt={f.filename}
                      className="w-full h-full object-cover"
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-primary drop-shadow" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5 text-[9px] text-white truncate">
                      {f.filename.replace(/^[a-f0-9]+/, "").replace(/^\./, "") || f.filename.slice(0, 8)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button size="sm" onClick={handleConfirm} disabled={!selected} className="gap-1.5 cursor-pointer">
            <CheckCircle2 className="w-3.5 h-3.5" />Use Selected
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const THEMES: { id: Theme; label: string; description: string; swatches: string[] }[] = [
  {
    id: "dark",
    label: "Dark",
    description: "Deep navy & electric blue",
    swatches: ["#0b1120", "#142043", "#3b5bdb", "#c8d8ff"],
  },
  {
    id: "light",
    label: "Light",
    description: "Clean white & blue",
    swatches: ["#f8fafc", "#e2e8f0", "#3b5bdb", "#1e293b"],
  },
  {
    id: "forest",
    label: "Forest",
    description: "Deep forest green",
    swatches: ["#091413", "#285A48", "#408A71", "#B0E4CC"],
  },
];

export default function AdminSettingsPage() {
  const { data: settings } = useGetAdminSettings({ query: { queryKey: getGetAdminSettingsQueryKey() } });
  const updateSettings = useUpdateAdminSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  const [form, setForm] = useState({
    siteName: "", siteUrl: "", siteDescription: "", currency: "INR",
    stripeEnabled: true, razorpayEnabled: false, emailNotificationsEnabled: true,
    commissionRate: 20,
    showFeaturedCourses: true, showFeaturedPackages: true,
  });
  const [maintenanceForm, setMaintenanceForm] = useState({ maintenanceMode: false, maintenanceMessage: "" });
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);

  const [googleForm, setGoogleForm] = useState({ clientId: "", clientSecret: "", enabled: false });
  const [showSecret, setShowSecret] = useState(false);
  const [googleSaving, setGoogleSaving] = useState(false);

  const [brandingForm, setBrandingForm] = useState({
    siteName: "", siteLogo: "", logoSize: 34, logoSizeMobile: 28, favicon: "", metaTitle: "", metaDescription: "",
  });
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [logoPicker, setLogoPicker] = useState(false);
  const [faviconPicker, setFaviconPicker] = useState(false);
  const API_BASE = import.meta.env.VITE_API_URL ?? "";

  useEffect(() => {
    if (settings) {
      setForm({
        siteName: settings.siteName, siteUrl: (settings as Record<string, unknown>).siteUrl as string ?? "", siteDescription: settings.siteDescription,
        currency: settings.currency, stripeEnabled: settings.stripeEnabled,
        razorpayEnabled: settings.razorpayEnabled, emailNotificationsEnabled: settings.emailNotificationsEnabled,
        commissionRate: settings.commissionRate,
        showFeaturedCourses: (settings as Record<string, unknown>).showFeaturedCourses as boolean ?? true,
        showFeaturedPackages: (settings as Record<string, unknown>).showFeaturedPackages as boolean ?? true,
      });
      setMaintenanceForm({
        maintenanceMode: (settings as Record<string, unknown>).maintenanceMode as boolean ?? false,
        maintenanceMessage: (settings as Record<string, unknown>).maintenanceMessage as string ?? "",
      });
      setGoogleForm({
        enabled: (settings as Record<string, unknown>).googleSignInEnabled as boolean ?? false,
        clientId: (settings as Record<string, unknown>).googleClientId as string ?? "",
        clientSecret: (settings as Record<string, unknown>).googleClientSecret as string ?? "",
      });
      setBrandingForm({
        siteName: settings.siteName ?? "",
        siteLogo: (settings as Record<string, unknown>).siteLogo as string ?? "",
        logoSize: (settings as Record<string, unknown>).logoSize as number ?? 34,
        logoSizeMobile: (settings as Record<string, unknown>).logoSizeMobile as number ?? 28,
        favicon: (settings as Record<string, unknown>).favicon as string ?? "",
        metaTitle: (settings as Record<string, unknown>).metaTitle as string ?? "",
        metaDescription: (settings as Record<string, unknown>).metaDescription as string ?? "",
      });
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({ data: form }, {
      onSuccess: () => { toast({ title: "Settings saved!" }); queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() }); },
      onError: () => toast({ title: "Error saving settings", variant: "destructive" }),
    });
  };

  const handleSaveMaintenance = async () => {
    setMaintenanceSaving(true);
    updateSettings.mutate({
      data: {
        maintenanceMode: maintenanceForm.maintenanceMode,
        maintenanceMessage: maintenanceForm.maintenanceMessage,
      } as Parameters<typeof updateSettings.mutate>[0]["data"],
    }, {
      onSuccess: () => {
        toast({ title: maintenanceForm.maintenanceMode ? "Maintenance mode enabled" : "Maintenance mode disabled" });
        queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
        setMaintenanceSaving(false);
      },
      onError: () => { toast({ title: "Error saving maintenance settings", variant: "destructive" }); setMaintenanceSaving(false); },
    });
  };

  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("image", file);
    const res = await fetch(`${API_BASE}/api/upload/image`, { method: "POST", credentials: "include", body: fd });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url as string;
  }, [API_BASE]);

  const handleSaveBranding = () => {
    setBrandingSaving(true);
    updateSettings.mutate({
      data: {
        siteName: brandingForm.siteName,
        siteLogo: brandingForm.siteLogo,
        logoSize: brandingForm.logoSize,
        logoSizeMobile: brandingForm.logoSizeMobile,
        favicon: brandingForm.favicon,
        metaTitle: brandingForm.metaTitle,
        metaDescription: brandingForm.metaDescription,
      } as Parameters<typeof updateSettings.mutate>[0]["data"],
    }, {
      onSuccess: () => {
        toast({ title: "Site identity saved!" });
        queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
        setBrandingSaving(false);
      },
      onError: () => { toast({ title: "Error saving branding", variant: "destructive" }); setBrandingSaving(false); },
    });
  };

  const handleSaveGoogle = () => {
    setGoogleSaving(true);
    updateSettings.mutate({
      data: {
        googleSignInEnabled: googleForm.enabled,
        googleClientId: googleForm.clientId,
        googleClientSecret: googleForm.clientSecret,
      } as Parameters<typeof updateSettings.mutate>[0]["data"],
    }, {
      onSuccess: () => {
        toast({ title: "Google Sign-In settings saved!" });
        queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["google-config"] });
        setGoogleSaving(false);
      },
      onError: () => { toast({ title: "Error saving Google settings", variant: "destructive" }); setGoogleSaving(false); },
    });
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Platform Settings</h1>
        <p className="text-muted-foreground">Configure your platform.</p>
      </div>

      <div className="space-y-6">
        {/* Appearance / Theme */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
            <CardDescription>Choose a colour theme for your platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {THEMES.map(t => {
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                      active
                        ? "border-primary shadow-md shadow-primary/20"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    {/* Swatch preview */}
                    <div className="flex gap-1 mb-2.5 rounded-lg overflow-hidden h-8">
                      {t.swatches.map((c, i) => (
                        <div key={i} className="flex-1 h-full" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <p className="text-xs font-semibold text-foreground">{t.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{t.description}</p>
                    {active && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Media Picker Dialogs */}
        <MediaPickerDialog
          open={logoPicker}
          onClose={() => setLogoPicker(false)}
          onSelect={url => setBrandingForm(f => ({ ...f, siteLogo: url }))}
          uploadFn={uploadImage}
          accept="image/*"
          title="Choose Logo from Library"
        />
        <MediaPickerDialog
          open={faviconPicker}
          onClose={() => setFaviconPicker(false)}
          onSelect={url => setBrandingForm(f => ({ ...f, favicon: url }))}
          uploadFn={uploadImage}
          accept="image/*,.ico"
          title="Choose Favicon from Library"
        />

        {/* Site Identity */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />Site Identity & SEO
            </CardTitle>
            <CardDescription>Configure your site logo, favicon and SEO metadata shown in search engines.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Platform Name */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Platform Name</Label>
              <Input
                value={brandingForm.siteName}
                onChange={e => setBrandingForm(f => ({ ...f, siteName: e.target.value }))}
                placeholder="e.g. Vipul Kumar Academy"
                className="bg-background border-border"
              />
              <p className="text-[11px] text-muted-foreground">Displayed in the navbar, emails and browser tab</p>
            </div>

            {/* Site Logo */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Site Logo</Label>
              <div className="flex items-start gap-4">
                {/* Preview */}
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-background flex-shrink-0 overflow-hidden">
                  {brandingForm.siteLogo ? (
                    <img
                      src={brandingForm.siteLogo}
                      alt="Logo preview"
                      style={{ width: brandingForm.logoSize * 1.5, height: brandingForm.logoSize * 1.5, objectFit: "contain" }}
                    />
                  ) : (
                    <ImageIcon className="w-7 h-7 text-muted-foreground/30" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 cursor-pointer"
                      onClick={() => setLogoPicker(true)}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Choose Logo
                    </Button>
                    {brandingForm.siteLogo && (
                      <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive cursor-pointer"
                        onClick={() => setBrandingForm(f => ({ ...f, siteLogo: "" }))}>
                        Remove
                      </Button>
                    )}
                  </div>
                  <Input
                    placeholder="https://example.com/logo.png"
                    value={brandingForm.siteLogo}
                    onChange={e => setBrandingForm(f => ({ ...f, siteLogo: e.target.value }))}
                    className="bg-background border-border text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">Recommended: PNG or SVG with transparent background</p>
                </div>
              </div>

              {/* Logo size sliders */}
              <div className="grid grid-cols-2 gap-4">
                {/* Desktop */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Desktop Size</Label>
                    <span className="text-xs font-mono text-foreground">{brandingForm.logoSize}px</span>
                  </div>
                  <input
                    type="range" min={16} max={80} step={2}
                    value={brandingForm.logoSize}
                    onChange={e => setBrandingForm(f => ({ ...f, logoSize: parseInt(e.target.value) }))}
                    className="w-full accent-primary cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>16px</span><span>80px</span>
                  </div>
                </div>
                {/* Mobile */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Mobile Size</Label>
                    <span className="text-xs font-mono text-foreground">{brandingForm.logoSizeMobile}px</span>
                  </div>
                  <input
                    type="range" min={12} max={60} step={2}
                    value={brandingForm.logoSizeMobile}
                    onChange={e => setBrandingForm(f => ({ ...f, logoSizeMobile: parseInt(e.target.value) }))}
                    className="w-full accent-primary cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>12px</span><span>60px</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Favicon */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Site Favicon</Label>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-background flex-shrink-0 overflow-hidden">
                  {brandingForm.favicon ? (
                    <img src={brandingForm.favicon} alt="Favicon" className="w-7 h-7 object-contain" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-muted-foreground/30" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 cursor-pointer"
                      onClick={() => setFaviconPicker(true)}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Choose Favicon
                    </Button>
                    {brandingForm.favicon && (
                      <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive cursor-pointer"
                        onClick={() => setBrandingForm(f => ({ ...f, favicon: "" }))}>
                        Remove
                      </Button>
                    )}
                  </div>
                  <Input
                    placeholder="https://example.com/favicon.ico"
                    value={brandingForm.favicon}
                    onChange={e => setBrandingForm(f => ({ ...f, favicon: e.target.value }))}
                    className="bg-background border-border text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">Recommended: 32×32px .ico, .png or .svg</p>
                </div>
              </div>
            </div>

            {/* SEO Meta */}
            <div className="space-y-4 pt-2 border-t border-border">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">SEO Metadata</p>
              <div className="space-y-1.5">
                <Label className="text-sm">Meta Title</Label>
                <Input
                  value={brandingForm.metaTitle}
                  onChange={e => setBrandingForm(f => ({ ...f, metaTitle: e.target.value }))}
                  placeholder="e.g. Vipul Kumar Academy — Learn Affiliate Marketing"
                  className="bg-background border-border"
                  maxLength={70}
                />
                <div className="flex justify-between">
                  <p className="text-[11px] text-muted-foreground">Shown as the browser tab title and in Google search results</p>
                  <span className={`text-[11px] font-mono ${brandingForm.metaTitle.length > 60 ? "text-amber-400" : "text-muted-foreground"}`}>
                    {brandingForm.metaTitle.length}/70
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Meta Description</Label>
                <Textarea
                  value={brandingForm.metaDescription}
                  onChange={e => setBrandingForm(f => ({ ...f, metaDescription: e.target.value }))}
                  placeholder="e.g. Premium online courses on affiliate marketing, e-commerce and dropshipping by Vipul Kumar."
                  className="bg-background border-border resize-none h-20 text-sm"
                  maxLength={160}
                />
                <div className="flex justify-between">
                  <p className="text-[11px] text-muted-foreground">Shown in Google search results below the title (ideal: 120–160 chars)</p>
                  <span className={`text-[11px] font-mono ${brandingForm.metaDescription.length > 155 ? "text-amber-400" : "text-muted-foreground"}`}>
                    {brandingForm.metaDescription.length}/160
                  </span>
                </div>
              </div>
            </div>

            <Button type="button" onClick={handleSaveBranding} disabled={brandingSaving} className="w-full gap-2 cursor-pointer">
              {brandingSaving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save Site Identity"}
            </Button>
          </CardContent>
        </Card>

        {/* General */}
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-base">General</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm mb-1.5 block">Platform Name</Label>
              <Input value={form.siteName} onChange={e => setForm(f => ({ ...f, siteName: e.target.value }))} className="bg-background" />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Site URL</Label>
              <Input value={form.siteUrl} onChange={e => setForm(f => ({ ...f, siteUrl: e.target.value }))} placeholder="https://yourdomain.com" className="bg-background" />
              <p className="text-xs text-muted-foreground mt-1">Your public site address (custom domain). Used in email buttons and affiliate share links. Must be a full URL starting with https:// — paths are stripped automatically.</p>
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Description</Label>
              <textarea value={form.siteDescription} onChange={e => setForm(f => ({ ...f, siteDescription: e.target.value }))} className="w-full p-3 rounded-md bg-background border border-border text-sm resize-none h-20" />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Currency</Label>
              <Input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="bg-background w-32" />
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Email Notifications</p>
                <p className="text-xs text-muted-foreground">Send emails for signups, purchases, etc.</p>
              </div>
              <Switch checked={form.emailNotificationsEnabled} onCheckedChange={v => setForm(f => ({ ...f, emailNotificationsEnabled: v }))} />
            </div>
          </CardContent>
        </Card>

        {/* Homepage Sections */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Homepage Sections</CardTitle>
            <CardDescription>Show or hide sections on the public homepage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Featured Courses</p>
                <p className="text-xs text-muted-foreground">Display the featured courses section to visitors</p>
              </div>
              <Switch checked={form.showFeaturedCourses} onCheckedChange={v => setForm(f => ({ ...f, showFeaturedCourses: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Featured Packages</p>
                <p className="text-xs text-muted-foreground">Display the featured packages section to visitors</p>
              </div>
              <Switch checked={form.showFeaturedPackages} onCheckedChange={v => setForm(f => ({ ...f, showFeaturedPackages: v }))} />
            </div>
          </CardContent>
        </Card>

        <Button type="button" onClick={handleSave} disabled={updateSettings.isPending} className="w-full">
          {updateSettings.isPending ? "Saving..." : "Save Settings"}
        </Button>

        {/* Maintenance Mode */}
        <Card className={`border-2 ${maintenanceForm.maintenanceMode ? "bg-amber-500/5 border-amber-500/40" : "bg-card border-border"}`}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Construction className={`w-4 h-4 ${maintenanceForm.maintenanceMode ? "text-amber-400" : "text-muted-foreground"}`} />
              Maintenance Mode
              {maintenanceForm.maintenanceMode && (
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-400 border border-amber-400/30">Active</span>
              )}
            </CardTitle>
            <CardDescription>When enabled, visitors see a maintenance page. Admins can still access the site.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable Maintenance Mode</p>
                <p className="text-xs text-muted-foreground">The website will be blocked for all non-admin users</p>
              </div>
              <Switch
                checked={maintenanceForm.maintenanceMode}
                onCheckedChange={v => setMaintenanceForm(f => ({ ...f, maintenanceMode: v }))}
              />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Maintenance Message <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                value={maintenanceForm.maintenanceMessage}
                onChange={e => setMaintenanceForm(f => ({ ...f, maintenanceMessage: e.target.value }))}
                placeholder="We're performing scheduled maintenance. We'll be back shortly!"
                className="bg-background border-border resize-none h-20 text-sm"
              />
            </div>
            {maintenanceForm.maintenanceMode && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                <Construction className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>Maintenance mode is <strong>ON</strong>. All visitors (except admins) will see the maintenance screen until you turn this off.</span>
              </div>
            )}
            <Button type="button" onClick={handleSaveMaintenance} disabled={maintenanceSaving} variant={maintenanceForm.maintenanceMode ? "default" : "outline"} className={`w-full border-border ${maintenanceForm.maintenanceMode ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}`}>
              {maintenanceSaving ? "Saving..." : maintenanceForm.maintenanceMode ? "Save & Keep Maintenance Active" : "Save Maintenance Settings"}
            </Button>
          </CardContent>
        </Card>

        {/* Social Login */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Chrome className="w-4 h-4 text-blue-400" />Social Login
            </CardTitle>
            <CardDescription>Allow users to sign in with their Google account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable Google Sign-In</p>
                <p className="text-xs text-muted-foreground">Show "Continue with Google" on login &amp; signup pages</p>
              </div>
              <Switch checked={googleForm.enabled} onCheckedChange={v => setGoogleForm(f => ({ ...f, enabled: v }))} />
            </div>

            <div className={`space-y-4 transition-opacity ${googleForm.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
              <div>
                <Label className="text-sm mb-1.5 block">Google Client ID</Label>
                <Input
                  value={googleForm.clientId}
                  onChange={e => setGoogleForm(f => ({ ...f, clientId: e.target.value }))}
                  placeholder="xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
                  className="bg-background font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">Google Client Secret</Label>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={googleForm.clientSecret}
                    onChange={e => setGoogleForm(f => ({ ...f, clientSecret: e.target.value }))}
                    placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx"
                    className="bg-background font-mono text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>Get your credentials from the <strong>Google Cloud Console</strong> → APIs &amp; Services → Credentials. Set the authorised redirect URI to <code className="bg-blue-500/20 px-1 rounded">/api/auth/google/callback</code>.</span>
              </div>
            </div>

            <Button type="button" onClick={handleSaveGoogle} disabled={googleSaving} variant="outline" className="w-full border-border">
              {googleSaving ? "Saving..." : "Save Google Settings"}
            </Button>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
