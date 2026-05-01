import { useState, useEffect } from "react";
import { useGetAdminSettings, getGetAdminSettingsQueryKey, useUpdateAdminSettings } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, AlertCircle, ShieldCheck, Eye, EyeOff, Send, Loader2, ChevronDown, ChevronRight, Activity } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AdminFacebookPixelPage() {
  const { data: settings } = useGetAdminSettings({ query: { queryKey: getGetAdminSettingsQueryKey() } });
  const updateSettings = useUpdateAdminSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({ enabled: false, pixelId: "", baseCode: "", accessToken: "", testEventCode: "" });
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [capiStatus, setCapiStatus] = useState<{ configured: boolean; source: string | null; test_mode: boolean } | null>(null);

  const refreshCapiStatus = () => {
    fetch(`${API_BASE}/api/pixel/capi-status`)
      .then(r => r.json())
      .then((d: { configured: boolean; source: string | null; test_mode: boolean }) => setCapiStatus(d))
      .catch(() => setCapiStatus({ configured: false, source: null, test_mode: false }));
  };

  useEffect(() => { refreshCapiStatus(); }, []);

  useEffect(() => {
    if (settings) {
      const s = settings as Record<string, unknown>;
      setForm({
        enabled: s.facebookPixelEnabled as boolean ?? false,
        pixelId: s.facebookPixelId as string ?? "",
        baseCode: s.facebookPixelBaseCode as string ?? "",
        accessToken: s.facebookAccessToken as string ?? "",
        testEventCode: s.facebookTestEventCode as string ?? "",
      });
      if (s.facebookPixelBaseCode) setAdvancedOpen(true);
    }
  }, [settings]);

  const handleSave = () => {
    setSaving(true);
    updateSettings.mutate({
      data: {
        facebookPixelEnabled: form.enabled,
        facebookPixelId: form.pixelId,
        facebookPixelBaseCode: form.baseCode,
        facebookAccessToken: form.accessToken,
        facebookTestEventCode: form.testEventCode,
      } as Parameters<typeof updateSettings.mutate>[0]["data"],
    }, {
      onSuccess: () => {
        toast({ title: "Settings saved" });
        queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
        refreshCapiStatus();
        setSaving(false);
      },
      onError: () => {
        toast({ title: "Save failed", variant: "destructive" });
        setSaving(false);
      },
    });
  };

  const handleSendTestEvent = async () => {
    if (!form.testEventCode.trim()) return;
    setSendingTest(true);
    try {
      const res = await fetch(`${API_BASE}/api/pixel/send-test-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_name: "InitiateCheckout" }),
      });
      const data = await res.json();
      if (res.ok && data.sent) {
        toast({
          title: "Test event sent",
          description: `"${data.event_name}" 30 seconds mein Test Events tab mein dikhega.`,
        });
      } else {
        toast({
          title: "Test failed",
          description: data.reason === "test_event_code_missing"
            ? "Test Event Code save karein pehle."
            : data.reason === "capi_not_configured"
              ? "Access Token nahi hai."
              : data.reason === "meta_rejected"
                ? `Meta: ${data.error?.message ?? "rejected"}`
                : data.reason ?? "Unknown error",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({ title: "Network error", description: String(e), variant: "destructive" });
    } finally {
      setSendingTest(false);
    }
  };

  const testEventsUrl = form.pixelId
    ? `https://www.facebook.com/events_manager2/list/pixel/${form.pixelId}/test_events`
    : "https://business.facebook.com/events_manager2";

  const StatusPill = ({ tone, icon: Icon, children }: { tone: "green" | "amber" | "muted"; icon: typeof Activity; children: React.ReactNode }) => {
    const tones = {
      green: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
      amber: "text-amber-500 bg-amber-500/10 border-amber-500/30",
      muted: "text-muted-foreground bg-muted/40 border-border",
    };
    return (
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide rounded-full border px-2.5 py-1 ${tones[tone]}`}>
        <Icon className="w-3 h-3" />
        {children}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facebook Pixel</h1>
          <p className="text-sm text-muted-foreground mt-1">Browser tracking + server-side Conversions API in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={form.enabled ? "green" : "muted"} icon={Activity}>
            Pixel {form.enabled ? "On" : "Off"}
          </StatusPill>
          {capiStatus?.configured && (
            <StatusPill tone="green" icon={ShieldCheck}>
              CAPI {capiStatus.source === "database" ? "· DB" : capiStatus.source === "environment" ? "· Env" : ""}
            </StatusPill>
          )}
          {capiStatus?.configured === false && (
            <StatusPill tone="amber" icon={AlertCircle}>CAPI Off</StatusPill>
          )}
          {capiStatus?.test_mode && (
            <StatusPill tone="amber" icon={AlertCircle}>Test Mode</StatusPill>
          )}
        </div>
      </div>

      {/* Test mode banner */}
      {capiStatus?.test_mode && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-amber-500 mb-0.5">Test mode is active</p>
            <p className="text-muted-foreground">All server-side events route to Meta's Test Events tab — production stats are not being recorded. Clear the Test Event Code below and Save to resume normal tracking.</p>
          </div>
        </div>
      )}

      <Card className="bg-card border-border">
        <CardContent className="p-6 space-y-7">

          {/* Enable */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable Pixel</p>
              <p className="text-xs text-muted-foreground mt-0.5">Inject the pixel on every page</p>
            </div>
            <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
          </div>

          <div className="h-px bg-border" />

          {/* Identity section */}
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Identity</p>

            <div>
              <Label className="text-sm mb-1.5 block">Pixel ID</Label>
              <Input
                value={form.pixelId}
                onChange={e => setForm(f => ({ ...f, pixelId: e.target.value }))}
                placeholder="1234567890123456"
                className="bg-background font-mono"
              />
            </div>

            <div>
              <Label className="text-sm mb-1.5 block">Access Token <span className="text-muted-foreground font-normal text-[11px]">· Conversions API</span></Label>
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  value={form.accessToken}
                  onChange={e => setForm(f => ({ ...f, accessToken: e.target.value }))}
                  placeholder="EAAxxxx..."
                  className="bg-background font-mono pr-10"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  aria-label={showToken ? "Hide token" : "Show token"}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Events Manager → Settings → Conversions API → <strong>Generate access token</strong>.
              </p>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Testing section */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Testing</p>

            <div>
              <Label className="text-sm mb-1.5 block">Test Event Code <span className="text-muted-foreground font-normal text-[11px]">· optional</span></Label>
              <div className="flex gap-2">
                <Input
                  value={form.testEventCode}
                  onChange={e => setForm(f => ({ ...f, testEventCode: e.target.value }))}
                  placeholder="TEST12345"
                  className="bg-background font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendTestEvent}
                  disabled={sendingTest || !form.testEventCode.trim()}
                  className="shrink-0 gap-2"
                >
                  {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sendingTest ? "Sending" : "Send Test"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                When set, all server-side events route to the Test Events tab instead of production. <span className="text-amber-500/90">Clear after testing.</span>
              </p>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Advanced collapsible */}
          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen(o => !o)}
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              {advancedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Advanced · custom base code
            </button>

            {advancedOpen && (
              <div className="mt-4">
                <Textarea
                  value={form.baseCode}
                  onChange={e => setForm(f => ({ ...f, baseCode: e.target.value }))}
                  placeholder={`<!-- Meta Pixel Code -->\n<script>\n!function(f,b,e,v,n,t,s)...\n</script>\n<!-- End Meta Pixel Code -->`}
                  className="bg-background font-mono text-xs min-h-[160px] resize-y"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Leave empty for auto-inject from Pixel ID above. <span className="text-amber-500/90">If you paste Meta's full snippet, remove <code className="bg-background px-1 py-0.5 rounded">fbq('track', 'PageView');</code></span> — we already fire PageView with deduplication.
                </p>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button type="button" onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "Saving..." : "Save Settings"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.open(testEventsUrl, "_blank")}
              className="gap-2"
              title="Open Meta Events Manager"
            >
              <ExternalLink className="w-4 h-4" />
              Events Manager
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
