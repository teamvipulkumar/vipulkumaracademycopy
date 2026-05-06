import { useState, useEffect, useRef, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { useValidateCoupon } from "@workspace/api-client-react";
import { SiteFooter } from "@/components/layout/app-layout";
import { getStoredRef } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, Lock, Check, Tag, CreditCard, ChevronDown, ChevronUp,
  BookOpen, Eye, EyeOff, PartyPopper, Copy, X, Smartphone, Wallet,
  AlertCircle, Package,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab",
  "Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand",
  "West Bengal","Delhi","Jammu & Kashmir","Ladakh","Chandigarh","Puducherry",
];

type BundleCourse = { id: number; title: string; price: number; thumbnailUrl: string | null; category: string; level: string };
type Bundle = {
  id: number; name: string; slug: string; description: string | null;
  thumbnailUrl: string | null; price: number; compareAtPrice: number | null;
  isActive: boolean; courses: BundleCourse[];
};
type ActiveGateway = { id: number; name: string; displayName: string; apiKey: string; isTestMode: boolean };

type BundleSuccessResult = {
  isNewUser: boolean;
  tempPassword?: string;
  user: { name: string; email: string };
  bundleId: number;
  bundleName: string;
  enrolledCount: number;
};

function fmtCard(v: string) { return v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim(); }
function fmtExpiry(v: string) { const d = v.replace(/\D/g, "").slice(0, 4); return d.length > 2 ? `${d.slice(0,2)}/${d.slice(2)}` : d; }

const GATEWAY_META: Record<string, { icon: string; logo?: string; label: string; tagline: string }> = {
  stripe:   { icon: "S", logo: "stripe-logo.png",   label: "Stripe",   tagline: "Cards · International" },
  razorpay: { icon: "R", logo: "razorpay-logo.png", label: "Razorpay", tagline: "UPI · Cards · Wallets" },
  cashfree: { icon: "CF", logo: "cashfree-logo.png", label: "Cashfree", tagline: "UPI · Cards · Instant" },
  paytm:    { icon: "P", logo: "paytm-logo.png",    label: "Paytm",    tagline: "Paytm Wallet · UPI · Cards" },
  payu:     { icon: "U", logo: "payu-logo.png",     label: "PayU",     tagline: "UPI · Cards · EMI" },
};

// ── Payment Gateway Simulation Modal ─────────────────────────────────────────
type PaymentModalProps = {
  gateway: string;
  amount: number;
  bundleName: string;
  onClose: () => void;
  onPay: () => Promise<void>;
};

function PaymentModal({ gateway, amount, bundleName, onClose, onPay }: PaymentModalProps) {
  const isStripe = gateway === "stripe";
  const meta = GATEWAY_META[gateway] ?? { icon: "💰", label: gateway, tagline: "Secure Payment" };
  const [tab, setTab] = useState<"upi" | "card" | "wallet">("upi");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [upi, setUpi] = useState("");
  const [wallet, setWallet] = useState("");
  const [step, setStep] = useState<"form" | "processing" | "verifying">("form");
  const [error, setError] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  const validateStripe = () => {
    const raw = card.number.replace(/\s/g, "");
    if (raw.length < 16) return "Enter a valid 16-digit card number";
    const [m, y] = card.expiry.split("/");
    const month = parseInt(m ?? "0"), year = 2000 + parseInt(y ?? "0");
    const now = new Date();
    if (!m || !y || month < 1 || month > 12 || year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) return "Enter a valid expiry date";
    if (card.cvv.length < 3) return "Enter a valid CVV";
    if (!card.name.trim()) return "Enter the cardholder name";
    return "";
  };

  const validateIndia = () => {
    if (tab === "upi") { if (!upi.includes("@") || upi.length < 5) return "Enter a valid UPI ID (e.g., name@upi)"; }
    if (tab === "card") { const raw = card.number.replace(/\s/g, ""); if (raw.length < 16) return "Enter a valid card number"; if (card.cvv.length < 3) return "Enter a valid CVV"; }
    if (tab === "wallet" && !wallet) return "Select a wallet";
    return "";
  };

  const handlePay = async () => {
    setError("");
    const err = isStripe ? validateStripe() : validateIndia();
    if (err) { setError(err); return; }
    setStep("processing");
    await new Promise(r => setTimeout(r, 1500));
    setStep("verifying");
    await new Promise(r => setTimeout(r, 1200));
    await onPay();
  };

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="bg-[#0d1424] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className={`px-5 pt-5 pb-4 flex items-center justify-between ${isStripe ? "bg-[#635BFF]/10 border-b border-[#635BFF]/20" : "bg-blue-500/10 border-b border-blue-500/20"}`}>
          <div className="flex items-center gap-2.5">
            {meta.logo
              ? <img src={`${import.meta.env.BASE_URL}${meta.logo}`} alt={meta.label} className="w-8 h-8 object-contain rounded" />
              : <span className="text-2xl">{meta.icon}</span>}
            <div>
              <p className="font-bold text-sm text-foreground">{meta.label} Checkout</p>
              <p className="text-xs text-muted-foreground truncate max-w-[160px]">{bundleName}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-bold text-lg text-foreground">₹{amount.toFixed(2)}</p>
            <div className="flex items-center gap-1 text-[10px] text-green-400 justify-end"><Lock className="w-2.5 h-2.5" />Secure</div>
          </div>
        </div>

        {(step === "processing" || step === "verifying") && (
          <div className="px-5 py-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin mx-auto" />
            <div>
              <p className="font-semibold text-foreground">{step === "processing" ? "Processing Payment..." : "Verifying with bank..."}</p>
              <p className="text-xs text-muted-foreground mt-1">Please do not close this window</p>
            </div>
            <div className="flex justify-center gap-1 pt-2">
              {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          </div>
        )}

        {step === "form" && (
          <div className="p-5 space-y-4">
            {isStripe ? (
              <div className="space-y-3.5">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Card Number</Label>
                  <div className="relative">
                    <Input placeholder="1234 5678 9012 3456" value={card.number} onChange={e => setCard(c => ({ ...c, number: fmtCard(e.target.value) }))} className="bg-background border-border font-mono pr-10" maxLength={19} />
                    <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Expiry (MM/YY)</Label>
                    <Input placeholder="MM/YY" value={card.expiry} onChange={e => setCard(c => ({ ...c, expiry: fmtExpiry(e.target.value) }))} className="bg-background border-border font-mono" maxLength={5} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">CVV</Label>
                    <Input placeholder="•••" type="password" value={card.cvv} onChange={e => setCard(c => ({ ...c, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))} className="bg-background border-border font-mono" maxLength={4} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Name on Card</Label>
                  <Input placeholder="John Doe" value={card.name} onChange={e => setCard(c => ({ ...c, name: e.target.value }))} className="bg-background border-border" />
                </div>
                <p className="text-[10px] text-muted-foreground text-center">Use any valid-looking test card (e.g. 4242 4242 4242 4242)</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-1.5 bg-background rounded-lg p-1">
                  {(["upi", "card", "wallet"] as const).map(t => (
                    <button key={t} type="button" onClick={() => { setTab(t); setError(""); }}
                      className={`py-1.5 text-xs font-medium rounded-md flex items-center justify-center gap-1 transition-colors ${tab === t ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
                      {t === "upi" && <Smartphone className="w-3 h-3" />}
                      {t === "card" && <CreditCard className="w-3 h-3" />}
                      {t === "wallet" && <Wallet className="w-3 h-3" />}
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
                {tab === "upi" && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">UPI ID</Label>
                    <Input placeholder="yourname@upi" value={upi} onChange={e => setUpi(e.target.value)} className="bg-background border-border font-mono" />
                    <p className="text-[10px] text-muted-foreground mt-1">Enter any valid-looking UPI ID (e.g. test@upi)</p>
                  </div>
                )}
                {tab === "card" && (
                  <div className="space-y-2.5">
                    <Input placeholder="Card Number (16 digits)" value={card.number} onChange={e => setCard(c => ({ ...c, number: fmtCard(e.target.value) }))} className="bg-background border-border font-mono" maxLength={19} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="MM/YY" value={card.expiry} onChange={e => setCard(c => ({ ...c, expiry: fmtExpiry(e.target.value) }))} className="bg-background border-border font-mono" maxLength={5} />
                      <Input placeholder="CVV" type="password" value={card.cvv} onChange={e => setCard(c => ({ ...c, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))} className="bg-background border-border font-mono" maxLength={4} />
                    </div>
                  </div>
                )}
                {tab === "wallet" && (
                  <div className="grid grid-cols-3 gap-2">
                    {["Paytm","PhonePe","GPay","Amazon","BHIM","Freecharge"].map(w => (
                      <button key={w} type="button" onClick={() => setWallet(w)}
                        className={`py-2.5 rounded-lg border text-xs font-medium transition-colors ${wallet === w ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                        {w}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <Button onClick={handlePay} className="w-full bg-primary hover:bg-primary/90 gap-2 font-semibold">
                <Lock className="w-4 h-4" />Pay ₹{amount.toFixed(2)} Securely
              </Button>
              <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1">
                <X className="w-3 h-3" />Cancel
              </button>
            </div>

            <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground pt-1 border-t border-border">
              <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-green-400" />SSL Encrypted</span>
              <span>·</span>
              <span>Simulated (no real charge)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bundle Stripe Data Type ───────────────────────────────────────────────────
type BundleStripeData = {
  clientSecret: string;
  publishableKey: string;
  sessionId: string;
  paymentIntentId: string;
  amount: number;
  isNewUser: boolean;
  tempPassword?: string;
  user: { name: string; email: string };
  bundleName: string;
  bundleId: number;
};

// ── Real Stripe Checkout Modal (Bundle) ───────────────────────────────────────
function BundleStripeCheckoutModal({
  stripeData, onSuccess, onClose,
}: { stripeData: BundleStripeData; onSuccess: (paymentIntentId: string) => void; onClose: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elementsRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [payError, setPayError] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    loadStripe(stripeData.publishableKey).then(stripe => {
      if (!stripe || !mounted || !mountRef.current) return;
      stripeRef.current = stripe;
      const elements = stripe.elements({
        clientSecret: stripeData.clientSecret,
        appearance: {
          theme: "night",
          variables: {
            colorPrimary: "#635BFF",
            colorBackground: "#0f1629",
            colorText: "#f1f5f9",
            colorTextSecondary: "#94a3b8",
            colorDanger: "#f87171",
            colorSuccess: "#4ade80",
            fontFamily: "Inter, system-ui, sans-serif",
            fontSizeBase: "14px",
            borderRadius: "8px",
            spacingUnit: "4px",
          },
          rules: {
            ".Input": { border: "1px solid #1e293b", backgroundColor: "#0d1424", color: "#f1f5f9" },
            ".Input:focus": { border: "1px solid #635BFF", boxShadow: "0 0 0 2px rgba(99,91,255,0.2)" },
            ".Label": { color: "#94a3b8", fontSize: "12px", fontWeight: "500" },
            ".Tab": { border: "1px solid #1e293b", backgroundColor: "#0d1424" },
            ".Tab:hover": { backgroundColor: "#1e293b" },
            ".Tab--selected": { border: "1px solid #635BFF", backgroundColor: "#635BFF15" },
            ".TabIcon--selected": { fill: "#635BFF" },
            ".TabLabel--selected": { color: "#635BFF" },
          },
        },
      });
      elementsRef.current = elements;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paymentEl = (elements as any).create("payment", { layout: "tabs" });
      paymentEl.mount(mountRef.current);
      paymentEl.on("ready", () => { if (mounted) setReady(true); });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paymentEl.on("change", (e: any) => { if (mounted) setPayError(e.error?.message ?? ""); });
    });
    return () => {
      mounted = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      elementsRef.current?.getElement?.("payment" as any)?.unmount?.();
    };
  }, [stripeData.clientSecret, stripeData.publishableKey]);

  const handlePay = async () => {
    if (!stripeRef.current || !elementsRef.current) return;
    setProcessing(true);
    setPayError("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error, paymentIntent } = await (stripeRef.current as any).confirmPayment({
        elements: elementsRef.current,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });
      if (error) { setPayError(error.message ?? "Payment failed"); return; }
      if (paymentIntent?.status === "succeeded") {
        onSuccess(paymentIntent.id);
      } else {
        setPayError(`Unexpected payment status: ${paymentIntent?.status}`);
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === overlayRef.current && !processing) onClose(); }}>
      <div className="bg-[#0f1629] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="px-6 pt-5 pb-4 flex items-center justify-between border-b border-white/8">
          <div>
            <p className="font-bold text-base text-foreground">{stripeData.bundleName}</p>
            <p className="text-2xl font-bold text-[#635BFF] mt-0.5">₹{stripeData.amount.toFixed(2)}</p>
          </div>
          <button type="button" onClick={onClose} disabled={processing}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          {!ready && !processing && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-8">
              <AlertCircle className="w-4 h-4 animate-pulse" />Loading secure payment form...
            </div>
          )}
          <div ref={mountRef} className={ready ? "block" : "hidden"} />

          {processing && (
            <div className="text-center py-8 space-y-3">
              <div className="w-12 h-12 rounded-full border-4 border-[#635BFF]/20 border-t-[#635BFF] animate-spin mx-auto" />
              <p className="font-semibold text-foreground">Processing Payment...</p>
              <p className="text-xs text-muted-foreground">Please do not close this window</p>
            </div>
          )}

          {payError && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 mt-3">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{payError}
            </div>
          )}

          {!processing && (
            <Button onClick={handlePay} disabled={!ready || processing}
              className="w-full mt-4 bg-[#635BFF] hover:bg-[#5349e8] h-11 font-semibold text-sm gap-2">
              <Lock className="w-4 h-4" />Pay ₹{stripeData.amount.toFixed(2)}
            </Button>
          )}
        </div>

        <div className="px-6 pb-4 flex items-center justify-center gap-2 text-[11px] text-muted-foreground border-t border-white/8 pt-3">
          <Shield className="w-3 h-3 text-green-400" />
          <span>Secured by Stripe · 256-bit SSL</span>
        </div>
      </div>
    </div>
  );
}

// ── Bundle Success Screen ─────────────────────────────────────────────────────
function BundleSuccessScreen({ result, onContinue }: { result: BundleSuccessResult; onContinue: () => void }) {
  const [copied, setCopied] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const copyPassword = () => {
    if (result.tempPassword) navigator.clipboard.writeText(result.tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-6 animate-pulse">
          <PartyPopper className="w-9 h-9 text-green-400" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Package Unlocked!</h1>
        <p className="text-muted-foreground mb-1">
          You now have access to all {result.enrolledCount} courses in
        </p>
        <p className="text-foreground font-semibold text-lg mb-2">"{result.bundleName}"</p>
        {result.isNewUser
          ? <p className="text-sm text-muted-foreground mb-6">Your account has been created and you're ready to learn.</p>
          : <p className="text-sm text-muted-foreground mb-6">All courses are now available in My Courses.</p>
        }

        {result.isNewUser && result.tempPassword && (
          <div className="bg-card border border-border rounded-xl p-5 mb-6 text-left">
            <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />Your Account Credentials
            </h3>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Email</p>
                <p className="text-sm font-mono bg-background rounded px-2.5 py-1.5 text-foreground border border-border">{result.user.email}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Temporary Password</p>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm font-mono bg-background rounded px-2.5 py-1.5 text-foreground border border-border tracking-widest">
                    {showPass ? result.tempPassword : "••••••••••"}
                  </p>
                  <button type="button" onClick={() => setShowPass(v => !v)} className="text-muted-foreground hover:text-foreground p-1.5">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button type="button" onClick={copyPassword} className="text-muted-foreground hover:text-foreground p-1.5">
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-amber-400 mt-3 flex items-start gap-1.5">
              <span className="mt-0.5">⚠️</span>Save these credentials — you'll need them to log in next time. You can change your password in account settings.
            </p>
          </div>
        )}

        <Button onClick={onContinue} size="lg" className="w-full bg-primary hover:bg-primary/90 gap-2">
          <BookOpen className="w-4 h-4" />Go to My Courses
        </Button>
      </div>
    </div>
  );
}

// ── Main Bundle Checkout Page ─────────────────────────────────────────────────
export default function BundleCheckoutPage() {
  const [, params] = useRoute("/bundles/:id/checkout");
  const bundleId = parseInt(params?.id ?? "0");
  const [, navigate] = useLocation();
  const { user: authUser, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [activeGateways, setActiveGateways] = useState<ActiveGateway[]>([]);
  const [gatewaysLoading, setGatewaysLoading] = useState(true);
  const [gateway, setGateway] = useState<string>("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number; type: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState<BundleSuccessResult | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [stripeData, setStripeData] = useState<BundleStripeData | null>(null);
  const [orderSummaryOpen, setOrderSummaryOpen] = useState(false);

  const [form, setForm] = useState({ email: "", fullName: "", state: "", mobile: "" });

  const { data: bundle, isLoading } = useQuery<Bundle>({
    queryKey: ["bundle", bundleId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/bundles/${bundleId}`);
      if (!res.ok) throw new Error("Bundle not found");
      return res.json();
    },
    enabled: bundleId > 0,
  });

  const validateCoupon = useValidateCoupon();

  useEffect(() => {
    if (isAuthenticated && authUser) {
      setForm(f => ({
        ...f,
        email: (authUser as { email?: string }).email ?? "",
        fullName: (authUser as { name?: string }).name ?? "",
      }));
    }
  }, [isAuthenticated, authUser]);

  useEffect(() => {
    fetch(`${API_BASE}/api/payments/gateways/active`)
      .then(r => r.json())
      .then((data: ActiveGateway[]) => { setActiveGateways(data); if (data.length > 0) setGateway(data[0].name); })
      .catch(() => {})
      .finally(() => setGatewaysLoading(false));
  }, []);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);

  const price = bundle?.price ?? 0;
  const compareAt = bundle?.compareAtPrice ?? null;
  const individualTotal = bundle?.courses.reduce((s, c) => s + c.price, 0) ?? 0;

  const discountedPrice = appliedCoupon
    ? appliedCoupon.type === "percentage"
      ? price - (price * appliedCoupon.discount / 100)
      : Math.max(0, price - appliedCoupon.discount)
    : price;

  const savings = compareAt ? compareAt - discountedPrice : individualTotal - discountedPrice;

  const handleApplyCoupon = () => {
    if (!couponCode.trim()) return;
    const code = couponCode.trim().toUpperCase();
    validateCoupon.mutate({ data: { code, courseId: undefined as unknown as number } }, {
      onSuccess: (data) => {
        if (!data.valid) { toast({ title: "Invalid coupon", description: data.message, variant: "destructive" }); return; }
        setAppliedCoupon({ code, discount: data.discountValue ?? 0, type: data.discountType ?? "percentage" });
        toast({ title: "Coupon applied!", description: data.message });
      },
      onError: () => toast({ title: "Invalid coupon", variant: "destructive" }),
    });
  };

  // ── Guest/Auth Checkout (simulated gateways) ──────────────────────────────
  const executePayment = async () => {
    setProcessing(true);
    const affiliateRef = getStoredRef() || undefined;
    try {
      const res = await fetch(`${API_BASE}/api/bundles/checkout/guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bundleId,
          email: form.email.trim(),
          fullName: form.fullName.trim(),
          state: form.state,
          mobile: form.mobile.trim(),
          gateway,
          couponCode: appliedCoupon?.code || undefined,
          affiliateRef,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      setSuccess({
        isNewUser: data.isNewUser,
        tempPassword: data.tempPassword,
        user: data.user,
        bundleId: data.bundleId,
        bundleName: data.bundleName,
        enrolledCount: data.enrolledCount,
      });
    } catch (err: unknown) {
      toast({ title: "Checkout failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  // ── Real Stripe Payment (Bundle) ──────────────────────────────────────────
  const handleStripePayment = useCallback(async () => {
    setProcessing(true);
    const affiliateRef = getStoredRef() || undefined;
    try {
      const res = await fetch(`${API_BASE}/api/bundles/stripe/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bundleId,
          email: form.email.trim(),
          fullName: form.fullName.trim(),
          state: form.state,
          mobile: form.mobile.trim(),
          couponCode: appliedCoupon?.code || undefined,
          affiliateRef,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to initiate Stripe payment");
      setStripeData(data as BundleStripeData);
    } catch (err: unknown) {
      toast({ title: "Stripe payment failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleId, form, appliedCoupon]);

  const handleStripeVerify = useCallback(async (paymentIntentId: string) => {
    if (!stripeData) return;
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/bundles/stripe/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paymentIntentId, sessionId: stripeData.sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Payment verification failed");
      setStripeData(null);
      setSuccess({
        isNewUser: stripeData.isNewUser,
        tempPassword: stripeData.tempPassword,
        user: stripeData.user,
        bundleId: stripeData.bundleId,
        bundleName: stripeData.bundleName,
        enrolledCount: data.enrolledCount ?? 0,
      });
    } catch (err: unknown) {
      toast({ title: "Payment verification failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripeData]);

  // ── Real Cashfree Payment ────────────────────────────────────────────────
  const handleCashfreePayment = async () => {
    setProcessing(true);
    const affiliateRef = getStoredRef() || undefined;
    try {
      const res = await fetch(`${API_BASE}/api/bundles/cashfree/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bundleId,
          email: form.email.trim(),
          fullName: form.fullName.trim(),
          state: form.state,
          mobile: form.mobile.trim(),
          couponCode: appliedCoupon?.code || undefined,
          affiliateRef,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to initiate Cashfree payment");

      const { paymentSessionId, orderId, isTestMode } = data;

      if (data.isNewUser && data.tempPassword) {
        sessionStorage.setItem("cf_new_user_creds", JSON.stringify({
          email: form.email.trim(),
          tempPassword: data.tempPassword,
          orderId,
        }));
      }

      if (!document.getElementById("cashfree-sdk")) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.id = "cashfree-sdk";
          script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Cashfree SDK"));
          document.head.appendChild(script);
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cashfree = (window as any).Cashfree({ mode: isTestMode ? "sandbox" : "production" });
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const returnUrl = `${window.location.origin}${base}/payment/verify?order_id={order_id}&gateway=cashfree`;
      cashfree.checkout({ paymentSessionId, returnUrl, redirectTarget: "_self" });
    } catch (err: unknown) {
      toast({ title: "Cashfree payment failed", description: (err as Error).message, variant: "destructive" });
      setProcessing(false);
    }
  };

  // ── Real Paytm Payment (Classic PG — form POST to Paytm hosted checkout) ───
  const handlePaytmPayment = async () => {
    setProcessing(true);
    const affiliateRef = getStoredRef() || undefined;
    try {
      const res = await fetch(`${API_BASE}/api/bundles/paytm/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bundleId,
          email: form.email.trim(),
          fullName: form.fullName.trim(),
          state: form.state,
          mobile: form.mobile.trim(),
          couponCode: appliedCoupon?.code || undefined,
          affiliateRef,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to initiate Paytm payment");

      const { paytmParams, actionUrl, orderId } = data as {
        paytmParams: Record<string, string>;
        actionUrl: string;
        orderId: string;
      };

      if (data.isNewUser && data.tempPassword) {
        sessionStorage.setItem("cf_new_user_creds", JSON.stringify({
          email: form.email.trim(),
          tempPassword: data.tempPassword,
          orderId,
        }));
      }

      // Auto-submit hidden HTML form to Paytm hosted checkout
      const paytmForm = document.createElement("form");
      paytmForm.method = "POST";
      paytmForm.action = actionUrl;
      paytmForm.style.display = "none";
      for (const [name, value] of Object.entries(paytmParams)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = String(value ?? "");
        paytmForm.appendChild(input);
      }
      document.body.appendChild(paytmForm);
      paytmForm.submit();
      // Page navigates away to Paytm — keep processing=true
    } catch (err: unknown) {
      toast({ title: "Paytm payment failed", description: (err as Error).message, variant: "destructive" });
      setProcessing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.fullName) {
      toast({ title: "Please fill in all required fields", variant: "destructive" }); return;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      toast({ title: "Please enter a valid email address", variant: "destructive" }); return;
    }
    if (!form.mobile || form.mobile.replace(/\D/g, "").length < 10) {
      toast({ title: "Please enter a valid 10-digit mobile number", variant: "destructive" }); return;
    }
    if (!form.state) {
      toast({ title: "Please select your state", variant: "destructive" }); return;
    }
    if (gateway === "stripe") { handleStripePayment(); return; }
    if (gateway === "cashfree") { handleCashfreePayment(); return; }
    if (gateway === "paytm") { handlePaytmPayment(); return; }
    setShowPaymentModal(true);
  };

  if (success) {
    return <BundleSuccessScreen result={success} onContinue={() => navigate("/my-courses")} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!bundle) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Package not found.</div>;
  }

  return (
    <>
    <div className="flex flex-col min-h-screen bg-background">
    <div className="flex-1 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-start mb-8">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="w-3.5 h-3.5 text-green-400" />
            <span>Secure Checkout</span>
          </div>
        </div>

        {/* Mobile: Collapsible Order Summary */}
        <div className="lg:hidden mb-6">
          <button
            type="button"
            onClick={() => setOrderSummaryOpen(o => !o)}
            className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-xl text-sm font-semibold"
          >
            <div className="flex items-center gap-3 min-w-0">
              {bundle.thumbnailUrl
                ? <img src={bundle.thumbnailUrl} alt={bundle.name} className="w-12 h-8 object-cover rounded-md flex-shrink-0" />
                : <div className="w-12 h-8 bg-primary/10 rounded-md flex items-center justify-center flex-shrink-0"><Package className="w-4 h-4 text-primary" /></div>
              }
              <span className="truncate text-foreground">{bundle.name}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
              <span className="text-primary font-bold">₹{discountedPrice.toFixed(2)}</span>
              {orderSummaryOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </button>
          {orderSummaryOpen && (
            <div className="mt-3 space-y-3">
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="font-semibold text-sm text-foreground mb-3">Order Summary</h3>
                <div className="space-y-2 text-sm">
                  {compareAt && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Compare at</span><span className="line-through">₹{compareAt.toFixed(2)}</span>
                    </div>
                  )}
                  {!compareAt && individualTotal > price && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Individual total ({bundle.courses.length} courses)</span><span className="line-through">₹{individualTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {appliedCoupon && (
                    <div className="flex justify-between text-green-400">
                      <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{appliedCoupon.code}</span>
                      <span>-₹{(appliedCoupon.type === "percentage" ? price * appliedCoupon.discount / 100 : Math.min(price, appliedCoupon.discount)).toFixed(2)}</span>
                    </div>
                  )}
                  {savings > 0 && (
                    <div className="flex justify-between text-green-400 text-xs">
                      <span>You save</span><span>₹{savings.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-2 flex justify-between font-bold text-foreground text-base">
                    <span>Total</span><span>₹{discountedPrice.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-5 gap-6 lg:gap-10 items-start">
          {/* ── Left: Form ── */}
          <div className="lg:col-span-3">
            <h1 className="text-2xl font-bold text-foreground mb-1">Complete your purchase</h1>
            <p className="text-sm text-muted-foreground mb-6">
              {isAuthenticated ? "Confirm your details and choose a payment method." : "Fill in your details below — we'll create your account automatically."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Account Info */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="font-semibold text-sm text-foreground mb-4 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">1</span>
                  Account Information
                </h2>
                <div className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <Label htmlFor="fullName">Full Name <span className="text-red-400">*</span></Label>
                      <Input
                        id="fullName" placeholder="John Doe" value={form.fullName}
                        onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                        readOnly={isAuthenticated}
                        className={`bg-background border-border ${isAuthenticated ? "opacity-70 cursor-not-allowed" : ""}`}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email Address <span className="text-red-400">*</span></Label>
                      <Input
                        id="email" type="email" placeholder="you@example.com" value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        readOnly={isAuthenticated}
                        className={`bg-background border-border ${isAuthenticated ? "opacity-70 cursor-not-allowed" : ""}`}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <Label htmlFor="mobile">Mobile Number <span className="text-red-400">*</span></Label>
                      <div className="flex">
                        <span className="inline-flex items-center px-3 border border-r-0 border-border bg-card rounded-l-md text-xs text-muted-foreground">+91</span>
                        <Input
                          id="mobile" type="tel" placeholder="9876543210" value={form.mobile}
                          onChange={e => setForm(f => ({ ...f, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                          className="bg-background border-border rounded-l-none"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="state">State <span className="text-red-400">*</span></Label>
                      <select
                        id="state" value={form.state}
                        onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                        className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        required
                      >
                        <option value="">Select state</option>
                        {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="font-semibold text-sm text-foreground mb-4 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">2</span>
                  Payment Method
                </h2>
                {gatewaysLoading ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[0, 1].map(i => <div key={i} className="h-20 rounded-xl bg-background animate-pulse" />)}
                  </div>
                ) : activeGateways.length === 0 ? (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>No payment methods are configured yet. Please contact support or try again later.</span>
                  </div>
                ) : (
                  <div className={`grid gap-3 ${activeGateways.length === 1 ? "grid-cols-1" : activeGateways.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
                    {activeGateways.map(g => {
                      const m = GATEWAY_META[g.name] ?? { icon: "💰", label: g.displayName, tagline: "Secure Payment" };
                      return (
                        <button key={g.name} type="button" onClick={() => setGateway(g.name)}
                          className={`py-3.5 px-4 rounded-xl border-2 transition-all text-sm font-semibold flex flex-col items-center gap-1.5 ${gateway === g.name ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-border/80"}`}>
                          {m.logo
                            ? <img src={`${import.meta.env.BASE_URL}${m.logo}`} alt={m.label} className="w-8 h-8 object-contain rounded" />
                            : <span className="text-xl">{m.icon}</span>}
                          <span>{m.label}</span>
                          <span className="text-[10px] font-normal text-muted-foreground text-center leading-tight">{m.tagline}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Shield className="w-3.5 h-3.5 text-green-400" />
                  <span>256-bit SSL encryption · Your payment is secure</span>
                </div>
              </div>

              {/* Coupon */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">3</span>
                  Coupon / Promo Code
                </h2>
                {!appliedCoupon ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter coupon code" value={couponCode}
                      onChange={e => setCouponCode(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleApplyCoupon())}
                      className="bg-background border-border font-mono"
                    />
                    <Button type="button" variant="outline" onClick={handleApplyCoupon} disabled={validateCoupon.isPending} className="border-border px-4">
                      {validateCoupon.isPending ? "..." : <Tag className="w-4 h-4" />}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2 text-sm text-green-400">
                      <Check className="w-4 h-4" />
                      <span className="font-mono font-bold">{appliedCoupon.code}</span>
                      <span className="text-xs">
                        {appliedCoupon.type === "percentage" ? `${appliedCoupon.discount}% off` : `₹${appliedCoupon.discount} off`}
                      </span>
                    </div>
                    <button type="button" onClick={() => { setAppliedCoupon(null); setCouponCode(""); }} className="text-xs text-muted-foreground hover:text-foreground">Remove</button>
                  </div>
                )}
              </div>

              {/* Courses included (mobile / within form) */}
              <div className="bg-card border border-border rounded-xl overflow-hidden lg:hidden">
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">{bundle.courses.length} Courses Included</span>
                </div>
                <div className="divide-y divide-border max-h-48 overflow-y-auto">
                  {bundle.courses.map(c => (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                      {c.thumbnailUrl
                        ? <img src={c.thumbnailUrl} alt={c.title} className="w-10 h-7 rounded object-cover flex-shrink-0" />
                        : <div className="w-10 h-7 bg-primary/10 rounded flex-shrink-0" />
                      }
                      <p className="text-xs font-medium truncate flex-1">{c.title}</p>
                      <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <Button type="submit" size="lg" disabled={processing || !gateway || activeGateways.length === 0} className="w-full bg-primary hover:bg-primary/90 text-base font-semibold gap-2 h-12">
                <CreditCard className="w-5 h-5" />
                {processing
                  ? (gateway === "cashfree" ? "Redirecting to Cashfree…" : "Processing payment...")
                  : gateway === "cashfree"
                    ? `Continue to Cashfree · ₹${discountedPrice.toFixed(2)}`
                    : `Pay ₹${discountedPrice.toFixed(2)} · Get Package Now`
                }
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                By completing this purchase, you agree to our Terms of Service.{" "}
                30-day money-back guarantee.
              </p>
            </form>
          </div>

          {/* ── Right: Order Summary (desktop) ── */}
          <div className="hidden lg:block lg:col-span-2 space-y-4">
            {/* Bundle card */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {bundle.thumbnailUrl && (
                <div className="w-full aspect-video overflow-hidden">
                  <img src={bundle.thumbnailUrl} alt={bundle.name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Package className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs text-primary font-semibold uppercase tracking-wider">Course Package</span>
                </div>
                <h3 className="font-bold text-foreground leading-snug mb-3">{bundle.name}</h3>
                {bundle.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{bundle.description}</p>}
              </div>
            </div>

            {/* Courses list */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">{bundle.courses.length} Courses Included</span>
              </div>
              <div className="divide-y divide-border max-h-56 overflow-y-auto">
                {bundle.courses.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    {c.thumbnailUrl
                      ? <img src={c.thumbnailUrl} alt={c.title} className="w-10 h-7 rounded object-cover flex-shrink-0" />
                      : <div className="w-10 h-7 bg-primary/10 rounded flex-shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{c.title}</p>
                      <p className="text-[10px] text-muted-foreground">{c.category} · {c.level}</p>
                    </div>
                    <div className="text-[10px] text-muted-foreground line-through flex-shrink-0">₹{c.price}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Price breakdown */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="font-semibold text-sm text-foreground mb-3">Order Summary</h3>
              <div className="space-y-2 text-sm">
                {compareAt && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Compare at</span><span className="line-through">₹{compareAt.toFixed(2)}</span>
                  </div>
                )}
                {!compareAt && individualTotal > price && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Individual total</span><span className="line-through">₹{individualTotal.toFixed(2)}</span>
                  </div>
                )}
                {appliedCoupon && (
                  <div className="flex justify-between text-green-400">
                    <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{appliedCoupon.code}</span>
                    <span>-₹{(appliedCoupon.type === "percentage" ? price * appliedCoupon.discount / 100 : Math.min(price, appliedCoupon.discount)).toFixed(2)}</span>
                  </div>
                )}
                {savings > 0 && (
                  <div className="flex justify-between text-green-400 text-xs">
                    <span>You save</span><span>₹{savings.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-border pt-2 flex justify-between font-bold text-foreground text-base">
                  <span>Total</span><span>₹{discountedPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* What's included */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="font-semibold text-sm text-foreground mb-3">This package includes</h3>
              <div className="space-y-2">
                {[
                  "Full lifetime access to all courses",
                  "Access on all devices",
                  "Certificates of completion",
                  "30-day money-back guarantee",
                ].map(t => (
                  <div key={t} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground py-2">
              <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" />SSL Secure</span>
              <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5" />Encrypted</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <SiteFooter />
    </div>

    {showPaymentModal && (
      <PaymentModal
        gateway={gateway}
        amount={discountedPrice}
        bundleName={bundle.name}
        onClose={() => setShowPaymentModal(false)}
        onPay={async () => {
          setShowPaymentModal(false);
          await executePayment();
        }}
      />
    )}

    {stripeData && (
      <BundleStripeCheckoutModal
        stripeData={stripeData}
        onSuccess={handleStripeVerify}
        onClose={() => setStripeData(null)}
      />
    )}
    </>
  );
}
