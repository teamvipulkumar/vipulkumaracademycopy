import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, Clock, CheckCircle2, TrendingUp } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DashboardData {
  creator: { id: number; name: string; status: string };
  totals: {
    lifetimeEarnings: number;
    pending: number;
    paid: number;
    thisMonth: number;
    salesCount: number;
  };
  recentSales: Array<{
    id: number;
    courseTitle: string | null;
    bundleName: string | null;
    saleAmount: number;
    commissionAmount: number;
    status: string;
    createdAt: string;
  }>;
}

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch(`${API_BASE}/api/creator/dashboard`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load dashboard");
  return res.json();
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function CreatorDashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["creator-dashboard"], queryFn: fetchDashboard });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-64" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-muted rounded-lg" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <div className="p-6">No data</div>;

  const stats = [
    { label: "Lifetime Earnings", value: fmt(data.totals.lifetimeEarnings), icon: TrendingUp, color: "text-green-600" },
    { label: "Pending", value: fmt(data.totals.pending), icon: Clock, color: "text-amber-600" },
    { label: "Paid Out", value: fmt(data.totals.paid), icon: CheckCircle2, color: "text-blue-600" },
    { label: "This Month", value: fmt(data.totals.thisMonth), icon: Wallet, color: "text-purple-600" },
  ];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {data.creator.name}</h1>
          <p className="text-sm text-muted-foreground">Your creator dashboard at a glance.</p>
        </div>
        <Badge variant={data.creator.status === "active" ? "default" : "destructive"}>
          {data.creator.status === "active" ? "Active" : "Revoked"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold mt-2">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Sales ({data.totals.salesCount})</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentSales.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No sales yet — your courses will earn commissions automatically once enabled.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="py-2 px-2">Date</th>
                    <th className="py-2 px-2">Course / Bundle</th>
                    <th className="py-2 px-2 text-right">Sale (your share)</th>
                    <th className="py-2 px-2 text-right">Commission</th>
                    <th className="py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSales.map(s => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-2 text-xs">{new Date(s.createdAt).toLocaleDateString("en-IN")}</td>
                      <td className="py-2 px-2">{s.courseTitle ?? s.bundleName ?? "—"}</td>
                      <td className="py-2 px-2 text-right">{fmt(s.saleAmount)}</td>
                      <td className="py-2 px-2 text-right font-semibold">{fmt(s.commissionAmount)}</td>
                      <td className="py-2 px-2">
                        <Badge variant={s.status === "paid" ? "default" : s.status === "cancelled" ? "destructive" : "secondary"}>
                          {s.status}
                        </Badge>
                      </td>
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
