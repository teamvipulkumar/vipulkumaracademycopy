import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CourseRow {
  id: number;
  title: string;
  thumbnailUrl: string | null;
  price: number;
  isPublished: boolean;
  salesCount: number;
  totalEarnings: number;
}

async function fetchCourses(): Promise<CourseRow[]> {
  const res = await fetch(`${API_BASE}/api/creator/courses`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load courses");
  return res.json();
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function CreatorCoursesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["creator-courses"], queryFn: fetchCourses });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Courses</h1>
        <p className="text-sm text-muted-foreground">Courses assigned to you by the admin. You earn 25% of each sale (split equally across all creators in a bundle).</p>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No courses assigned yet. Contact the admin to assign courses to your creator profile.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map(c => (
            <Card key={c.id} className="overflow-hidden">
              {c.thumbnailUrl ? (
                <div className="aspect-video bg-muted overflow-hidden">
                  <img src={c.thumbnailUrl} alt={c.title} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-video bg-muted flex items-center justify-center">
                  <BookOpen className="w-10 h-10 text-muted-foreground/40" />
                </div>
              )}
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-start justify-between gap-2">
                  <span className="line-clamp-2">{c.title}</span>
                  <Badge variant={c.isPublished ? "default" : "secondary"} className="flex-shrink-0">
                    {c.isPublished ? "Live" : "Draft"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-medium">{fmt(c.price)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sales</span>
                  <span className="font-medium">{c.salesCount}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t">
                  <span className="text-muted-foreground">Your earnings</span>
                  <span className="font-bold text-primary">{fmt(c.totalEarnings)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
