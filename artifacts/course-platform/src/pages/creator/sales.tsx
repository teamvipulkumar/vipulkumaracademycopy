import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Sale {
  id: number;
  courseTitle: string | null;
  bundleName: string | null;
  saleAmount: number;
  commissionAmount: number;
  commissionPercent: number;
  status: string;
  payoutId: number | null;
  createdAt: string;
}

async function fetchSales(page: number, status: string): Promise<{ rows: Sale[]; total: number; pageSize: number }> {
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (status !== "all") params.set("status", status);
  const res = await fetch(`${API_BASE}/api/creator/sales?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load sales");
  return res.json();
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function CreatorSalesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const { data, isLoading } = useQuery({
    queryKey: ["creator-sales", page, status],
    queryFn: () => fetchSales(page, status),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sales & Commissions</h1>
        <p className="text-sm text-muted-foreground">Every sale that earned you a commission. 25% of each sale is split equally across the courses involved.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Commission Ledger</CardTitle>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="earned">Earned (pending payout)</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="cancelled">Cancelled (refunds)</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : !data || data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No commission rows for this filter.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="py-2 px-2">Date</th>
                      <th className="py-2 px-2">Course / Bundle</th>
                      <th className="py-2 px-2 text-right">Your sale share</th>
                      <th className="py-2 px-2 text-right">Rate</th>
                      <th className="py-2 px-2 text-right">Commission</th>
                      <th className="py-2 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map(s => (
                      <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 px-2 text-xs">{new Date(s.createdAt).toLocaleString("en-IN")}</td>
                        <td className="py-2 px-2">
                          {s.courseTitle ?? s.bundleName ?? "—"}
                          {s.bundleName && s.courseTitle && (
                            <span className="block text-[10px] text-muted-foreground">via {s.bundleName}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">{fmt(s.saleAmount)}</td>
                        <td className="py-2 px-2 text-right text-xs">{s.commissionPercent}%</td>
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
              <div className="flex items-center justify-between pt-3 mt-3 border-t">
                <p className="text-xs text-muted-foreground">
                  Showing {(page - 1) * data.pageSize + 1}–{Math.min(page * data.pageSize, data.total)} of {data.total}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
