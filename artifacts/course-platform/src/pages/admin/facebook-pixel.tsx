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
import { Check, ExternalLink, Globe, Zap, Server, AlertCircle, ShieldCheck } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AdminFacebookPixelPage() {
  const { data: settings } = useGetAdminSettings({ query: { queryKey: getGetAdminSettingsQueryKey() } });
  const updateSettings = useUpdateAdminSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({ enabled: false, pixelId: "", baseCode: "" });
  const [saving, setSaving] = useState(false);
  const [capiConfigured, setCapiConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/pixel/capi-status`)
      .then(r => r.json())
      .then((d: { configured: boolean }) => setCapiConfigured(d.configured))
      .catch(() => setCapiConfigured(false));
  }, []);

  useEffect(() => {
    if (settings) {
      setForm({
        enabled: (settings as Record<string, unknown>).facebookPixelEnabled as boolean ?? false,
        pixelId: (settings as Record<string, unknown>).facebookPixelId as string ?? "",
        baseCode: (settings as Record<string, unknown>).facebookPixelBaseCode as string ?? "",
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
      } as Parameters<typeof updateSettings.mutate>[0]["data"],
    }, {
      onSuccess: () => {
        toast({ title: "Facebook Pixel settings saved!" });
        queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
        setSaving(false);
      },
      onError: () => {
        toast({ title: "Error saving Pixel settings", variant: "destructive" });
        setSaving(false);
      },
    });
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
              {capiConfigured === true && (
                <span className="text-[11px] font-semibold uppercase tracking-wide text-green-500 bg-green-500/10 border border-green-500/30 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Active
                </span>
              )}
              {capiConfigured === false && (
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
            {capiConfigured === false && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-sm">
                <p className="font-semibold text-amber-500 mb-2">Action required</p>
                <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal pl-4">
                  <li>Open Meta Events Manager → your Pixel → Settings → Conversions API</li>
                  <li>Click <strong>Generate access token</strong> (and revoke any previously leaked one)</li>
                  <li>Add the token as the secret <code className="bg-background px-1 py-0.5 rounded">FACEBOOK_CAPI_ACCESS_TOKEN</code> in Replit Secrets</li>
                  <li>Restart the API server — this card will turn green</li>
                </ol>
              </div>
            )}
            {capiConfigured === true && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-xs text-muted-foreground">
                Server-side dispatch is active. Every conversion event now reaches Meta from two sources (browser + server), giving you complete coverage even when ad blockers strip the browser pixel.
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
