import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Loader2, CheckCircle2, XCircle, AlertCircle, BookOpen, Copy, Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { fbTrack } from "@/lib/facebook-pixel";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type VerifyState = "verifying" | "success" | "pending" | "failed" | "error";

type NewUserCreds = {
  email: string;
  tempPassword: string;
};

type SuccessData = {
  courseId?: number;
  courseTitle?: string;
  bundleId?: number;
  bundleName?: string;
  courseCount?: number;
  newUser?: NewUserCreds;
};

export default function PaymentVerifyPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const params = new URLSearchParams(search);
  const orderId = params.get("order_id");
  const gateway = params.get("gateway") ?? "cashfree";

  const [state, setState] = useState<VerifyState>("verifying");
  const [message, setMessage] = useState("");
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (!orderId) { setState("error"); setMessage("No order ID found in the URL."); return; }

    const verify = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/payments/${gateway}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ orderId }),
        });
        const data = await res.json();

        if (!res.ok) {
          setState("error");
          setMessage(data.error ?? "Verification failed. Please contact support.");
          return;
        }

        if (data.success && (data.enrolled || data.alreadyEnrolled)) {
          // Read new-user credentials from sessionStorage (saved before Cashfree redirect)
          let newUser: NewUserCreds | undefined;
          try {
            const raw = sessionStorage.getItem("cf_new_user_creds");
            if (raw) {
              const parsed = JSON.parse(raw) as { email: string; tempPassword: string; orderId: string };
              // Only use if the orderId matches to avoid showing stale creds
              if (parsed.orderId === orderId) {
                newUser = { email: parsed.email, tempPassword: parsed.tempPassword };
              }
              sessionStorage.removeItem("cf_new_user_creds");
            }
          } catch { /* ignore */ }

          fbTrack("Purchase", {
            value: data.amount ?? 0,
            currency: data.currency ?? "INR",
            content_type: "product",
            content_ids: data.courseId ? [String(data.courseId)] : data.bundleId ? [String(data.bundleId)] : [],
            content_name: data.courseTitle ?? data.bundleName ?? "",
            // Pass our gateway sessionId — pixel.ts route will look up the
            // payment row and enrich with hashed billing email/phone/name
            // for higher Event Match Quality on Meta's side.
            order_id: orderId,
          }, newUser ? { email: newUser.email } : undefined);
          setState("success");
          setSuccessData({ courseId: data.courseId, courseTitle: data.courseTitle, bundleId: data.bundleId, bundleName: data.bundleName, courseCount: data.courseCount, newUser });
        } else if (data.pending) {
          setState("pending");
          setMessage(data.message ?? "Payment is processing. Please wait a moment.");
        } else {
          setState("failed");
          setMessage(data.message ?? "Payment was not completed. Please try again.");
        }
      } catch {
        setState("error");
        setMessage("Could not connect to payment server. Please contact support.");
      }
    };

    verify();
  }, [orderId, gateway]);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!`, description: "Saved to clipboard." });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-8 text-center shadow-xl">

        {state === "verifying" && (
          <>
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Verifying Payment</h2>
            <p className="text-sm text-muted-foreground">Please wait while we confirm your payment with the gateway…</p>
            <div className="flex justify-center gap-1 mt-5">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </>
        )}

        {state === "success" && successData && (
          <>
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-9 h-9 text-green-400" />
            </div>

            <h2 className="text-xl font-bold text-foreground mb-1">Payment Successful!</h2>
            {successData.bundleName ? (
              <>
                <p className="text-sm text-muted-foreground mb-1">You're now enrolled in all courses from</p>
                <p className="font-semibold text-foreground mb-5">"{successData.bundleName}"</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-1">You've been enrolled in</p>
                <p className="font-semibold text-foreground mb-5">"{successData.courseTitle}"</p>
              </>
            )}

            {/* New user credentials box */}
            {successData.newUser && (
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 mb-5 text-left">
                <div className="flex items-center gap-2 mb-3">
                  <KeyRound className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Your Account Credentials</p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  A new account has been created for you. Save these login details — you can change your password later from your profile.
                </p>

                {/* Email */}
                <div className="bg-card border border-border rounded-lg px-3 py-2 flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-mono text-foreground truncate">{successData.newUser.email}</span>
                  </div>
                  <button onClick={() => copy(successData.newUser!.email, "Email")} className="text-muted-foreground hover:text-foreground ml-2 flex-shrink-0">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Password */}
                <div className="bg-card border border-border rounded-lg px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <KeyRound className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-mono text-foreground">
                      {showPass ? successData.newUser.tempPassword : "••••••••••"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                    <button onClick={() => setShowPass(v => !v)} className="text-muted-foreground hover:text-foreground">
                      {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => copy(successData.newUser!.tempPassword, "Password")} className="text-muted-foreground hover:text-foreground">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {successData.bundleId ? (
              <Button onClick={() => navigate("/my-courses")} className="w-full bg-primary gap-2">
                <BookOpen className="w-4 h-4" />Go to My Courses
              </Button>
            ) : (
              <Button onClick={() => navigate(`/learn/${successData.courseId}`)} className="w-full bg-primary gap-2">
                <BookOpen className="w-4 h-4" />Start Learning Now
              </Button>
            )}
            <Button variant="ghost" onClick={() => navigate("/")} className="w-full mt-2 text-muted-foreground">
              Back to Home
            </Button>
          </>
        )}

        {state === "pending" && (
          <>
            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-9 h-9 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Payment Processing</h2>
            <p className="text-sm text-muted-foreground mb-6">{message}</p>
            <Button onClick={() => window.location.reload()} variant="outline" className="w-full border-border mb-2">
              Check Again
            </Button>
            <Button variant="ghost" onClick={() => navigate("/courses")} className="w-full text-muted-foreground">
              Browse Courses
            </Button>
          </>
        )}

        {(state === "failed" || state === "error") && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-9 h-9 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              {state === "failed" ? "Payment Failed" : "Verification Error"}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">{message}</p>
            <Button onClick={() => navigate("/courses")} className="w-full bg-primary mb-2">
              Browse Courses
            </Button>
            <Button variant="ghost" onClick={() => navigate("/")} className="w-full text-muted-foreground">
              Back to Home
            </Button>
          </>
        )}

        {/* Order reference */}
        {orderId && (
          <p className="text-[10px] text-muted-foreground/50 mt-6 font-mono">
            Order: {orderId}
          </p>
        )}
      </div>
    </div>
  );
}
