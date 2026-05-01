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
import { ExternalLink, AlertCircle, ShieldCheck, Eye, EyeOff, Send, Loader2, ChevronDown, ChevronRight, Activity, Lock, Pencil, X } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type PixelForm = { enabled: boolean; pixelId: string; baseCode: string; accessToken: string };
const EMPTY_FORM: PixelForm = { enabled: false, pixelId: "", baseCode: "", accessToken: "" };

export default function AdminFacebookPixelPage() {
  const { data: settings } = useGetAdminSettings({ query: { queryKey: getGetAdminSettingsQueryKey() } });
  const updateSettings = useUpdateAdminSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState<PixelForm>(EMPTY_FORM);
  const [savedSnapshot, setSavedSnapshot] = useState<PixelForm>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [capiStatus, setCapiStatus] = useState<{ configured: boolean; source: string | null; test_mode: boolean } | null>(null);

  // Test Event panel — independent of saved settings, transient input only.
  const [testCodeInput, setTestCodeInput] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);

  const locked = !editing;

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
      const next: PixelForm = {
        enabled: s.facebookPixelEnabled as boolean ?? false,
        pixelId: s.facebookPixelId as string ?? "",
        baseCode: s.facebookPixelBaseCode as string ?? "",
        accessToken: s.facebookAccessToken as string ?? "",
      };
      setForm(next);
      setSavedSnapshot(next);
      if (s.facebookPixelBaseCode) setAdvancedOpen(true);
      // Pre-fill the test panel with any saved code (legacy/env-set), but
      // changes here are NOT persisted — purely a one-shot test input.
      const savedTestCode = s.facebookTestEventCode as string ?? "";
      if (savedTestCode) setTestCodeInput(savedTestCode);
    }
  }, [settings]);

  const handleEdit = () => setEditing(true);

  const handleCancel = () => {
    setForm(savedSnapshot);
    setShowToken(false);
    setEditing(false);
  };

  const handleSave = () => {
    setSaving(true);
    updateSettings.mutate({
      data: {
        facebookPixelEnabled: form.enabled,
        facebookPixelId: form.pixelId,
        facebookPixelBaseCode: form.baseCode,
        facebookAccessToken: form.accessToken,
      } as Parameters<typeof updateSettings.mutate>[0]["data"],
    }, {
      onSuccess: () => {
        toast({ title: "Settings saved" });
        setSavedSnapshot(form);
        setEditing(false);
        setShowToken(false);
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

  // Clears the persisted facebookTestEventCode from platform_settings so
  // /api/pixel/event no longer routes real visitor events to Test Events.
  // The local transient testCodeInput is left alone — admin may still test.
  const handleClearPersistedTestCode = () => {
    if (saving) return;
    setSaving(true);
    updateSettings.mutate({
      data: { facebookTestEventCode: "" } as Parameters<typeof updateSettings.mutate>[0]["data"],
    }, {
      onSuccess: () => {
        toast({ title: "Test mode cleared", description: "Real-user events will now hit production again." });
        queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
        refreshCapiStatus();
      },
      onError: (e) => toast({ title: "Failed to clear", description: String(e), variant: "destructive" }),
      onSettled: () => setSaving(false),
    });
  };

  const handleSendTestEvent = async () => {
    if (sendingTest || sendingAll) return;
    const code = testCodeInput.trim();
    if (!code) return;
    setSendingTest(true);
    try {
      const res = await fetch(`${API_BASE}/api/pixel/send-test-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_name: "InitiateCheckout", test_event_code: code }),
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

  // Fire all 3 production events in parallel for full pipeline verification.
  // Each call uses the same TEST code so they all land in the Test Events tab.
  const handleSendAllEvents = async () => {
    if (sendingAll || sendingTest) return;
    const code = testCodeInput.trim();
    if (!code) return;
    setSendingAll(true);
    const events = ["PageView", "InitiateCheckout", "Purchase"] as const;
    try {
      const results = await Promise.all(events.map(async (event_name) => {
        try {
          const res = await fetch(`${API_BASE}/api/pixel/send-test-event`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event_name, test_event_code: code }),
          });
          const data = await res.json();
          return { event_name, ok: res.ok && data.sent === true, reason: data.reason as string | undefined, error: data.error };
        } catch (e) {
          return { event_name, ok: false, reason: "network_error", error: { message: String(e) } };
        }
      }));

      const successes = results.filter(r => r.ok);
      const failures = results.filter(r => !r.ok);

      if (failures.length === 0) {
        toast({
          title: `All ${successes.length} events sent ✓`,
          description: `${events.join(", ")} — 30 seconds mein Test Events tab mein dikhne lagenge.`,
        });
      } else if (successes.length > 0) {
        toast({
          title: `${successes.length}/${events.length} events sent`,
          description: `Failed: ${failures.map(f => `${f.event_name} (${f.error?.message ?? f.reason ?? "unknown"})`).join("; ")}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "All events failed",
          description: failures[0].reason === "capi_not_configured"
            ? "Access Token configure karein pehle."
            : failures.map(f => `${f.event_name}: ${f.error?.message ?? f.reason ?? "unknown"}`).join("; "),
          variant: "destructive",
        });
      }
    } finally {
      setSendingAll(false);
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

      {/* Test mode banner — appears only when a TEST code is persisted in DB
          (legacy state, env config, or someone using SQL). The transient input
          in the bottom card does NOT trigger this. */}
      {capiStatus?.test_mode && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs flex-1">
            <p className="font-semibold text-amber-500 mb-0.5">Test mode is active</p>
            <p className="text-muted-foreground">All server-side events route to Meta's Test Events tab — production stats are NOT being recorded. A TEST code is persisted in your settings; click Clear to resume normal tracking.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 h-7 text-xs border-amber-500/40 hover:bg-amber-500/20"
            onClick={handleClearPersistedTestCode}
            disabled={saving}
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Clear test mode"}
          </Button>
        </div>
      )}

      <Card className={`bg-card border-border transition-colors ${editing ? "ring-1 ring-primary/40" : ""}`}>
        <CardContent className="p-6 space-y-7">

          {/* Lock / edit mode indicator */}
          <div className={`flex items-center justify-between gap-3 -mx-6 -mt-6 px-6 py-3 border-b border-border ${editing ? "bg-primary/5" : "bg-muted/30"}`}>
            <div className="flex items-center gap-2 text-xs">
              {editing ? (
                <>
                  <Pencil className="w-3.5 h-3.5 text-primary" />
                  <span className="font-semibold text-primary">Edit mode</span>
                  <span className="text-muted-foreground">— changes will be saved when you click Save</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-semibold text-foreground">Locked</span>
                  <span className="text-muted-foreground">— click Edit to modify</span>
                </>
              )}
            </div>
            {locked && (
              <Button type="button" size="sm" variant="outline" onClick={handleEdit} className="h-7 gap-1.5">
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </Button>
            )}
          </div>

          {/* Enable */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable Pixel</p>
              <p className="text-xs text-muted-foreground mt-0.5">Inject the pixel on every page</p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))}
              disabled={locked}
            />
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
                disabled={locked}
                readOnly={locked}
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
                  disabled={locked}
                  readOnly={locked}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(s => !s)}
                  disabled={locked || !form.accessToken}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={showToken ? "Hide token" : "Show token"}
                  title={locked ? "Unlock to view token" : (showToken ? "Hide token" : "Show token")}
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
                  disabled={locked}
                  readOnly={locked}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Leave empty for auto-inject from Pixel ID above. <span className="text-amber-500/90">If you paste Meta's full snippet, remove <code className="bg-background px-1 py-0.5 rounded">fbq('track', 'PageView');</code></span> — we already fire PageView with deduplication.
                </p>
              </div>
            )}
          </div>

          {/* Footer actions — change based on lock state */}
          <div className="flex items-center gap-3 pt-2">
            {editing ? (
              <>
                <Button type="button" onClick={handleSave} disabled={saving} className="flex-1">
                  {saving ? "Saving..." : "Save Settings"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={saving}
                  className="gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button type="button" onClick={handleEdit} className="flex-1 gap-2">
                  <Pencil className="w-4 h-4" />
                  Edit Settings
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
              </>
            )}
          </div>

        </CardContent>
      </Card>

      {/* ── Standalone Test Event panel ──
          Independent of the main config card — admin can type any TEST code
          and fire a one-shot test event WITHOUT saving it to the database. */}
      <Card className="bg-card border-border mt-5">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                Send a Test Event
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Fire a synthetic <code className="bg-background px-1 py-0.5 rounded text-[11px]">InitiateCheckout</code> event to verify your CAPI setup. Type any TEST code below and click Send — nothing is saved.
              </p>
            </div>
          </div>

          <div>
            <Label className="text-sm mb-1.5 block">Test Event Code</Label>
            <Input
              value={testCodeInput}
              onChange={e => setTestCodeInput(e.target.value)}
              placeholder="TEST12345"
              className="bg-background font-mono"
              autoComplete="off"
              spellCheck={false}
              disabled={sendingTest || sendingAll}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleSendTestEvent}
              disabled={sendingTest || sendingAll || !testCodeInput.trim() || !capiStatus?.configured}
              className="gap-2"
              title={!capiStatus?.configured ? "Save Access Token first" : !testCodeInput.trim() ? "Enter a TEST code" : "Send InitiateCheckout test"}
            >
              {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sendingTest ? "Sending…" : "Send InitiateCheckout"}
            </Button>
            <Button
              type="button"
              onClick={handleSendAllEvents}
              disabled={sendingTest || sendingAll || !testCodeInput.trim() || !capiStatus?.configured}
              className="gap-2"
              title={!capiStatus?.configured ? "Save Access Token first" : !testCodeInput.trim() ? "Enter a TEST code" : "Send PageView + InitiateCheckout + Purchase"}
            >
              {sendingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sendingAll ? "Sending all 3…" : "Send All Events"}
            </Button>
          </div>

          <div className="rounded-md border border-border bg-background/50 p-3 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">What "Send All Events" does</p>
            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
              <li><strong className="text-foreground">PageView</strong> — verifies basic CAPI connectivity</li>
              <li><strong className="text-foreground">InitiateCheckout</strong> — verifies checkout funnel tracking</li>
              <li><strong className="text-foreground">Purchase</strong> — verifies conversion / revenue tracking (₹1 synthetic)</li>
            </ul>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Get the code from Events Manager → <strong>Test Events</strong> tab — top of page shows your unique <code className="bg-background px-1 py-0.5 rounded">TEST&lt;digits&gt;</code> code. Events appear within 30 seconds and do NOT affect production stats.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
