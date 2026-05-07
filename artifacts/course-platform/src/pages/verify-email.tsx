import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { CheckCircle2, XCircle, Loader2, Mail, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

type State = "loading" | "success" | "already" | "expired" | "invalid" | "error";

export default function VerifyEmailPage() {
  const [location] = useLocation();
  const { refetchUser } = useAuth();
  const token = new URLSearchParams(window.location.search).get("token");

  const [state, setState] = useState<State>(token ? "loading" : "invalid");
  const [message, setMessage] = useState("");
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
      credentials: "include",
    })
      .then(async r => {
        const data = await r.json();
        if (r.ok) {
          setState(data.message?.includes("already") ? "already" : "success");
          setMessage(data.message);
          refetchUser();
        } else {
          const msg: string = data.error ?? "";
          if (msg.includes("expired")) setState("expired");
          else setState("invalid");
          setMessage(msg);
        }
      })
      .catch(() => {
        setState("error");
        setMessage("Something went wrong. Please try again.");
      });
  }, [token]);

  const resendEmail = async () => {
    setResending(true);
    try {
      const r = await fetch(`${API_BASE}/api/auth/resend-verify-email`, {
        method: "POST",
        credentials: "include",
      });
      if (r.ok) setResendDone(true);
    } catch {}
    setResending(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0a0f1e" }}>
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-8 text-center shadow-2xl">
          {state === "loading" && (
            <>
              <div className="w-16 h-16 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Verifying your email…</h1>
              <p className="text-slate-400 text-sm">Please wait a moment.</p>
            </>
          )}

          {(state === "success" || state === "already") && (
            <>
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-9 h-9 text-green-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-3">
                {state === "already" ? "Already Verified!" : "Email Verified!"}
              </h1>
              <p className="text-slate-300 text-sm mb-7 leading-relaxed">
                {state === "already"
                  ? "Your email address is already verified. You have full access to your account."
                  : "Your email has been successfully verified. Welcome to ClickOcean!"}
              </p>
              <Link href="/my-courses"
                className="inline-flex items-center justify-center h-11 px-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-sm">
                Go to My Courses
              </Link>
            </>
          )}

          {state === "expired" && (
            <>
              <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <XCircle className="w-9 h-9 text-amber-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-3">Link Expired</h1>
              <p className="text-slate-300 text-sm mb-7 leading-relaxed">
                This verification link has expired (links are valid for 24 hours). Request a new one below.
              </p>
              {resendDone ? (
                <div className="flex items-center justify-center gap-2 text-green-400 text-sm font-medium bg-green-500/10 rounded-xl px-4 py-3">
                  <CheckCircle2 className="w-4 h-4" />
                  New verification email sent! Check your inbox.
                </div>
              ) : (
                <button
                  onClick={resendEmail}
                  disabled={resending}
                  className="inline-flex items-center justify-center gap-2 h-11 px-8 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors text-sm disabled:opacity-60"
                >
                  {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {resending ? "Sending…" : "Resend Verification Email"}
                </button>
              )}
            </>
          )}

          {state === "invalid" && (
            <>
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <XCircle className="w-9 h-9 text-red-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-3">Invalid Link</h1>
              <p className="text-slate-300 text-sm mb-7 leading-relaxed">
                {token
                  ? "This verification link is invalid or has already been used."
                  : "No verification token found. Please use the link from your email."}
              </p>
              {resendDone ? (
                <div className="flex items-center justify-center gap-2 text-green-400 text-sm font-medium bg-green-500/10 rounded-xl px-4 py-3">
                  <CheckCircle2 className="w-4 h-4" />
                  New verification email sent! Check your inbox.
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={resendEmail}
                    disabled={resending}
                    className="inline-flex items-center justify-center gap-2 h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-sm disabled:opacity-60"
                  >
                    {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    {resending ? "Sending…" : "Resend Verification Email"}
                  </button>
                  <Link href="/login"
                    className="inline-flex items-center justify-center h-11 px-6 border border-white/10 text-slate-300 hover:text-white hover:border-white/20 font-semibold rounded-xl transition-colors text-sm">
                    Back to Login
                  </Link>
                </div>
              )}
            </>
          )}

          {state === "error" && (
            <>
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <XCircle className="w-9 h-9 text-red-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-3">Something went wrong</h1>
              <p className="text-slate-300 text-sm mb-7">
                Unable to verify your email right now. Please try again or contact support.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 h-11 px-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                <RefreshCw className="w-4 h-4" /> Try Again
              </button>
            </>
          )}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-500 mt-5">
          Need help?{" "}
          <a href="mailto:support@vipulkumaracademy.com" className="text-blue-400 hover:underline">
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}
