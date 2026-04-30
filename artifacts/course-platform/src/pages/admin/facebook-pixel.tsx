import { useState, useEffect } from "react";
import { useGetAdminSettings, getGetAdminSettingsQueryKey, useUpdateAdminSettings } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Check, ExternalLink, Globe, Zap, Server, AlertCircle, ShieldCheck, Eye, EyeOff, Send, Loader2 } from "lucide-react";

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
        toast({ title: "Facebook Pixel settings saved!" });
        queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
        refreshCapiStatus();
        setSaving(false);
      },
      onError: () => {
        toast({ title: "Error saving Pixel settings", variant: "destructive" });
        setSaving(false);
      },
    });
  };

  const handleSendTestEvent = async () => {
    if (!form.testEventCode.trim()) {
      toast({ title: "Test Event Code missing", description: "Pehle Test Event Code daalein aur Save karein.", variant: "destructive" });
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch(`${API_BASE}/api/pixel/send-test-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_name: "Lead" }),
      });
      const data = await res.json();
      if (res.ok && data.sent) {
        toast({
          title: "Test event Meta ko bhej diya!",
          description: `Event "${data.event_name}" 30 seconds mein Test Events tab mein dikhega.`,
        });
      } else {
        toast({
          title: "Test event fail hua",
          description: data.reason === "test_event_code_missing"
            ? "Pehle Test Event Code save karein."
            : data.reason === "capi_not_configured"
              ? "Access Token configured nahi hai."
              : data.reason === "meta_rejected"
                ? `Meta ne reject kiya: ${data.error?.message ?? "unknown error"}`
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

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Facebook Pixel</h1>
        <p className="text-muted-foreground">Browser pixel + Server-Side Conversions API — events fire from the visitor's browser AND from our server, so ad blockers and iOS privacy don't break attribution.</p>
      </div>

      <div className="space-y-6">

        {/* Config card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" />
              <CardTitle className="text-base">Pixel Configuration</CardTitle>
            </div>
            <CardDescription>
              Enable the pixel and paste your Pixel ID and base code from Meta Events Manager.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable Facebook Pixel</p>
                <p className="text-xs text-muted-foreground">Activates pixel injection on every page</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
            </div>

            <div>
              <Label className="text-sm mb-1.5 block">Pixel ID</Label>
              <Input
                value={form.pixelId}
                onChange={e => setForm(f => ({ ...f, pixelId: e.target.value }))}
                placeholder="e.g. 1234567890123456"
                className="bg-background font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Found in Events Manager → Data Sources → your Pixel → Settings tab.
              </p>
            </div>

            <div>
              <Label className="text-sm mb-1.5 block">
                Pixel Base Code
                <span className="ml-2 text-muted-foreground font-normal text-xs">(paste from Meta Events Manager)</span>
              </Label>
              <Textarea
                value={form.baseCode}
                onChange={e => setForm(f => ({ ...f, baseCode: e.target.value }))}
                placeholder={`<!-- Meta Pixel Code -->\n<script>\n!function(f,b,e,v,n,t,s)...\n</script>\n<!-- End Meta Pixel Code -->`}
                className="bg-background font-mono text-xs min-h-[180px] resize-y"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Copy from Events Manager → your Pixel → Overview → Install Pixel → Copy Code. If left empty, the platform auto-injects using the Pixel ID above.
              </p>
              <p className="text-[11px] text-amber-500/90 mt-1.5">
                <strong>Tip:</strong> If you paste Meta's full snippet, remove the line <code className="bg-background px-1 py-0.5 rounded">fbq('track', 'PageView');</code> from it — our app already fires PageView on every route change with deduplication. Leaving it in causes the initial PageView to be counted twice in Events Manager (does not affect Lead / InitiateCheckout / Purchase counts).
              </p>
            </div>

            {/* CAPI Access Token */}
            <div className="pt-3 border-t border-border">
              <Label className="text-sm mb-1.5 block">
                Conversions API Access Token
                <span className="ml-2 text-muted-foreground font-normal text-[11px]">(server-side dispatch — keep secret)</span>
              </Label>
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  value={form.accessToken}
                  onChange={e => setForm(f => ({ ...f, accessToken: e.target.value }))}
                  placeholder="EAAxxxx... (long token from Events Manager)"
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
                Events Manager → your Pixel → Settings → Conversions API → <strong>Generate access token</strong>. Saved here, this overrides the <code className="bg-background px-1 py-0.5 rounded text-[11px]">FACEBOOK_CAPI_ACCESS_TOKEN</code> env var.
              </p>
            </div>

            {/* Test Event Code */}
            <div>
              <Label className="text-sm mb-1.5 block">
                Test Event Code
                <span className="ml-2 text-muted-foreground font-normal text-[11px]">(optional — routes events to the Test Events tab)</span>
              </Label>
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
                  title="Sample Lead event Meta ko bhejo aur Test Events tab mein verify karo"
                >
                  {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sendingTest ? "Sending..." : "Send Test Event"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Get this from Events Manager → Test Events tab — top of page shows your unique <code className="bg-background px-1 py-0.5 rounded text-[11px]">TEST&lt;digits&gt;</code> code. While set, <strong>all</strong> server-side events route to Test Events instead of production stats. <span className="text-amber-500/90">Clear this field after testing!</span>
              </p>
              {capiStatus?.test_mode && (
                <p className="text-[11px] text-amber-500 mt-1.5 flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3" />
                  Test mode is currently <strong>ACTIVE</strong> — production events are not being recorded. Clear the Test Event Code and Save to resume normal tracking.
                </p>
              )}
            </div>

            <Button type="button" onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "Saving..." : "Save Pixel Settings"}
            </Button>
          </CardContent>
        </Card>

        {/* CAPI status card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-400" />
                <CardTitle className="text-base">Conversions API (Server-Side)</CardTitle>
              </div>
              {capiStatus?.configured === true && (
                <span className="text-[11px] font-semibold uppercase tracking-wide text-green-500 bg-green-500/10 border border-green-500/30 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Active{capiStatus.source === "database" ? " · DB" : capiStatus.source === "environment" ? " · Env" : ""}
                </span>
              )}
              {capiStatus?.configured === false && (
                <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Not Configured
                </span>
              )}
            </div>
            <CardDescription>
              Sends every Lead, InitiateCheckout, and Purchase event from our server directly to Meta — bypassing ad blockers, iOS Safari ITP, and Brave. Each event uses the same <code className="text-[11px] bg-background px-1 py-0.5 rounded">event_id</code> as the browser pixel so Meta deduplicates them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {capiStatus?.configured === false && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-sm">
                <p className="font-semibold text-amber-500 mb-2">Action required</p>
                <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal pl-4">
                  <li>Open Meta Events Manager → your Pixel → Settings → Conversions API</li>
                  <li>Click <strong>Generate access token</strong> (and revoke any previously leaked one)</li>
                  <li>Paste the token in the <strong>Conversions API Access Token</strong> field above and click Save</li>
                  <li>This card turns green automatically — no server restart needed</li>
                </ol>
              </div>
            )}
            {capiStatus?.configured === true && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-xs text-muted-foreground">
                Server-side dispatch is active{capiStatus.source === "database" ? " (token saved in database)" : capiStatus.source === "environment" ? " (token from FACEBOOK_CAPI_ACCESS_TOKEN env var)" : ""}. Every conversion event now reaches Meta from two sources (browser + server), giving you complete coverage even when ad blockers strip the browser pixel.
              </div>
            )}
            <div className="text-xs text-muted-foreground bg-background border border-border rounded-lg p-3 space-y-1.5">
              <p><strong>How it works:</strong></p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Browser fires <code className="bg-card px-1 rounded">fbq('track', ...)</code> with an event ID (when fbq is ready, otherwise it's queued)</li>
                <li>Same event also POSTs to <code className="bg-card px-1 rounded">/api/pixel/event</code> with the same event ID</li>
                <li>Server adds visitor IP, user-agent, _fbp/_fbc cookies, and SHA-256 hashes of email/phone for matching</li>
                <li>Meta deduplicates by event ID so you never get double-counted conversions</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Test Events card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-400" />
              <CardTitle className="text-base">Test Events</CardTitle>
            </div>
            <CardDescription>
              After saving, use Meta's Test Events tool to confirm events fire correctly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="space-y-1.5 text-xs text-muted-foreground">
              {[
                "Save your settings above and make sure the toggle is ON",
                "Click the button below — it opens the Test Events tab in Meta Events Manager",
                "Select Website as the marketing channel",
                "Enter your live site URL and click Test Events",
                "Browse the site — PageView, InitiateCheckout, Purchase etc. appear live",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => window.open(testEventsUrl, "_blank")}
            >
              <ExternalLink className="w-4 h-4" />
              Open Test Events in Meta Events Manager
            </Button>
          </CardContent>
        </Card>

        {/* Events tracked */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Events Tracked Automatically</CardTitle>
            <CardDescription>All events fire in the visitor's browser — no extra setup needed.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {[
                { event: "PageView", trigger: "Every page / route change" },
                { event: "ViewContent", trigger: "Course detail page — includes course name & price" },
                { event: "Lead", trigger: "Optin form submission" },
                { event: "InitiateCheckout", trigger: "Checkout page load" },
                { event: "Purchase", trigger: "Successful payment — includes value & currency" },
              ].map(({ event, trigger }) => (
                <div key={event} className="flex items-start gap-3 p-3 rounded-lg bg-background border border-border">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold font-mono text-foreground">{event}</p>
                    <p className="text-xs text-muted-foreground">{trigger}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
