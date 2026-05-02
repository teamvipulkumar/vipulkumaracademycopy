import { useState } from "react";
import {
  useGetAdminAnalytics, getGetAdminAnalyticsQueryKey,
  useGetRevenueReport, getGetRevenueReportQueryKey,
  useGetAdminPeriodSummary, getGetAdminPeriodSummaryQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { useAuth } from "@/lib/auth-context";

export default function AdminDashboard() {
  const { isStaff } = useAuth();
  // Heading reflects role so a team member doesn't see "Admin Dashboard"
  // (which would mislead them into thinking they own the platform).
  const heading = isStaff ? "Staff Dashboard" : "Admin Dashboard";
  const subheading = isStaff ? "Your assigned panel overview." : "Platform overview and analytics.";
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "1y">("7d");
  const [summaryPeriod, setSummaryPeriod] = useState<"7d" | "14d" | "30d">("7d");

  const { data: analytics } = useGetAdminAnalytics({ query: { queryKey: getGetAdminAnalyticsQueryKey() } });
  const { data: revenue } = useGetRevenueReport({ period }, { query: { queryKey: getGetRevenueReportQueryKey({ period }) } });
  const { data: summary } = useGetAdminPeriodSummary(
    { period: summaryPeriod },
    { query: { queryKey: getGetAdminPeriodSummaryQueryKey({ period: summaryPeriod }) } },
  );

  const stats = [
    { label: "Total Users", value: analytics?.totalUsers ?? 0, trend: `+${analytics?.newUsersThisMonth ?? 0} this month` },
    { label: "Total Enrollments", value: analytics?.totalEnrollments ?? 0, trend: `+${analytics?.newEnrollmentsThisMonth ?? 0} this month` },
    { label: "Total Revenue", value: `₹${(analytics?.totalRevenue ?? 0).toFixed(2)}`, trend: `₹${(analytics?.revenueThisMonth ?? 0).toFixed(2)} this month` },
    { label: "Total Courses", value: analytics?.totalCourses ?? 0, trend: "Published & Drafts" },
  ];

  const tooltipStyle = { background: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", fontSize: "12px" };
  const hasData = revenue?.chartData && revenue.chartData.length > 0;

  /* ── Donut chart: normalise all three onto a comparable unit scale ── */
  const revenueScaled = (summary?.revenue ?? 0) / 100;  // scale ₹ down to same magnitude as counts
  const enrollments  = summary?.enrollments ?? 0;
  const newUsers     = summary?.newUsers     ?? 0;
  const totalUnits   = revenueScaled + enrollments + newUsers || 1;

  const donutData = [
    { name: "Revenue",     value: revenueScaled, rawValue: `₹${(summary?.revenue ?? 0).toFixed(2)}`, color: "#2563eb" },
    { name: "Enrollments", value: enrollments,   rawValue: enrollments,                               color: "#10b981" },
    { name: "New Users",   value: newUsers,       rawValue: newUsers,                                  color: "#f59e0b" },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{heading}</h1>
        <p className="text-muted-foreground">{subheading}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <Card key={s.label} className="bg-card border-border">
            <CardContent className="p-5">
              <div className="text-sm text-muted-foreground mb-1">{s.label}</div>
              <div className="text-2xl font-bold mb-1">{s.value}</div>
              <div className="text-xs text-primary">{s.trend}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Row 1: Revenue chart + Top Courses ── */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Revenue Overview</CardTitle>
            <Select value={period} onValueChange={(v) => setPeriod(v as "7d" | "30d" | "90d" | "1y")}>
              <SelectTrigger className="w-28 h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
                <SelectItem value="90d">90 days</SelectItem>
                <SelectItem value="1y">1 year</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold mb-4">₹{(revenue?.totalRevenue ?? 0).toFixed(2)}</div>
            {hasData ? (
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={revenue!.chartData} barCategoryGap="35%">
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(37,99,235,0.06)" }} />
                  <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} fillOpacity={0.85} />
                  <Area type="monotone" dataKey="revenue" stroke="#818cf8" fill="url(#revGrad)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No revenue data yet</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-base">Top Courses</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(analytics?.topCourses ?? []).map((c, i) => (
                <div key={c.id} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground">{c.enrollmentCount} enrollments</p>
                  </div>
                </div>
              ))}
              {(!analytics?.topCourses || analytics.topCourses.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 2: Period Summary Radial Chart ── */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Period Summary</CardTitle>
          <div className="flex items-center rounded-md border border-border overflow-hidden h-8">
            {(["7d", "14d", "30d"] as const).map((p, idx) => (
              <button
                key={p}
                onClick={() => setSummaryPeriod(p)}
                className={`px-3 h-full text-xs font-medium transition-colors cursor-pointer ${idx > 0 ? "border-l border-border" : ""} ${
                  summaryPeriod === p
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {p === "7d" ? "Last 7 days" : p === "14d" ? "Last 14 days" : "Last 30 days"}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center gap-10">
            {/* Single donut chart */}
            <div className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 240, height: 240 }}>
              <PieChart width={240} height={240}>
                <Pie
                  data={donutData}
                  cx={115}
                  cy={115}
                  innerRadius={72}
                  outerRadius={110}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {donutData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={tooltipStyle} className="px-3 py-2">
                        <p className="font-semibold text-xs mb-0.5" style={{ color: d.color }}>{d.name}</p>
                        <p className="text-xs text-foreground font-medium">{d.rawValue}</p>
                      </div>
                    );
                  }}
                />
              </PieChart>
              {/* Centre label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xs text-muted-foreground leading-none mb-1">Total</span>
                <span className="text-lg font-bold leading-none">
                  {enrollments + newUsers}
                </span>
                <span className="text-[10px] text-muted-foreground mt-1">users + enrolled</span>
              </div>
            </div>

            {/* Legend + values */}
            <div className="flex-1 space-y-5 w-full">
              {donutData.map((item) => {
                const pct = totalUnits > 0 ? Math.round((item.value / totalUnits) * 100) : 0;
                return (
                  <div key={item.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-sm font-medium">{item.name}</span>
                      </div>
                      <span className="text-sm font-bold">{item.rawValue}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: item.color }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground pt-1">
                Showing activity for the selected period.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
