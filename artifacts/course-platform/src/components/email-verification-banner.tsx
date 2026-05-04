import { useState } from "react";
import { AlertTriangle, MailCheck, X, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export function EmailVerificationBanner() {
  const { user, isAuthenticated, isLoading, isFetching } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (isLoading || isFetching || !isAuthenticated || !user) return null;
  if (user.emailVerified) return null;
  if (dismissed) return null;

  const resend = async () => {
    setSending(true);
    try {
      const r = await fetch(`${API_BASE}/api/auth/resend-verify-email`, {
        method: "POST",
        credentials: "include",
      });
      if (r.ok) setSent(true);
    } catch {}
    setSending(false);
  };

  return (
    <div className="relative z-40 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 text-amber-300 text-sm flex-1 min-w-0">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="font-medium">Verify your email to unlock all features.</span>
          <span className="text-amber-400/70 hidden sm:inline">We sent a link to <strong className="text-amber-300">{user.email}</strong></span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {sent ? (
            <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
              <MailCheck className="w-3.5 h-3.5" />
              Email sent! Check your inbox.
            </span>
          ) : (
            <button
              onClick={resend}
              disabled={sending}
              className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 bg-amber-400 hover:bg-amber-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {sending ? "Sending…" : "Resend Email"}
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-400/60 hover:text-amber-300 transition-colors p-0.5 rounded cursor-pointer"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
