import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Payout {
  id: number;
  amount: number;
  status: string;
  releaseDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  notes: string | null;
  createdAt: string;
}

async function fetchPayouts(): Promise<Payout[]> {
  const res = await fetch(`${API_BASE}/api/creator/payouts`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load payouts");
  return res.json();
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "paid") return "default";
  if (s === "failed" || s === "cancelled") return "destructive";
  return "secondary";
}

export default function CreatorPayoutsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["creator-payouts"], queryFn: fetchPayouts });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payouts</h1>
        <p className="text-sm text-muted-foreground">Saturday auto-payout cycle. Admin can also release manually. Once released, status becomes <b>pending</b> until the bank transfer is made.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payout History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No payouts yet — pending commissions will be batched into a payout on the next Saturday.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="py-2 px-2">Released</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-2">Method</th>
                    <th className="py-2 px-2">Txn Reference</th>
                    <th className="py-2 px-2">Paid At</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-2 text-xs">
                        {p.releaseDate ? new Date(p.releaseDate).toLocaleDateString("en-IN") : new Date(p.createdAt).toLocaleDateString("en-IN")}
                      </td>
                      <td className="py-2 px-2 text-right font-semibold">{fmt(p.amount)}</td>
                      <td className="py-2 px-2">
                        <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                      </td>
                      <td className="py-2 px-2 text-xs">{p.paymentMethod ?? "—"}</td>
                      <td className="py-2 px-2 text-xs font-mono">{p.paymentReference ?? "—"}</td>
                      <td className="py-2 px-2 text-xs">{p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-IN") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
