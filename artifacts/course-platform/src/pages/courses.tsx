import { useState, useEffect } from "react";
import { useListCourses, getListCoursesQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

export default function CoursesPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);

  const { data, isLoading } = useListCourses(
    { search: debouncedSearch || undefined, category: category === "all" ? undefined : category, limit: 20, offset: 0 },
    { query: { queryKey: getListCoursesQueryKey({ search: debouncedSearch, category }) } }
  );
  const courses = data?.courses ?? [];

  const handleSearch = (v: string) => {
    setSearch(v);
    setTimeout(() => setDebouncedSearch(v), 400);
  };

  const levelColors: Record<string, string> = {
    beginner: "bg-green-500/10 text-green-400 border-green-500/20",
    intermediate: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    advanced: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 sm:px-10 md:px-16 lg:px-24 py-8 md:py-12">
        <div className="mb-6 md:mb-10">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">Course Catalog</h1>
          <p className="text-muted-foreground text-sm md:text-base">Proven systems to build and scale your online income.</p>
        </div>

        {/* ── Individual Courses ── */}
        <div className="mb-4">
          <div className="flex flex-col sm:flex-row gap-3 mb-6 md:mb-8">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Search courses..." value={search} onChange={e => handleSearch(e.target.value)} className="pl-9 bg-card border-border w-full" />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-52 bg-card border-border"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Affiliate Marketing">Affiliate Marketing</SelectItem>
                <SelectItem value="E-commerce">E-commerce</SelectItem>
                <SelectItem value="Dropshipping">Dropshipping</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {[1,2,3,4,5,6].map(i => <div key={i} className="h-72 bg-card rounded-xl animate-pulse" />)}
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">No courses found.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {courses.map(course => (
              <Link href={`/courses/${course.id}`} key={course.id}>
                <Card className="h-full bg-card border-border hover:border-primary/50 transition-all duration-200 cursor-pointer group">
                  <div className="relative w-full aspect-video overflow-hidden rounded-t-lg">
                    {course.thumbnailUrl ? (
                      <img src={course.thumbnailUrl} alt={course.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/20 to-blue-900/30 flex items-center justify-center">
                        <div className="text-4xl font-black text-primary/30 select-none">{course.category.charAt(0)}</div>
                      </div>
                    )}
                    {(course as { tag?: string | null }).tag === "coming_soon" && (
                      <div className="absolute top-2 left-2 z-10 bg-[#1d4fd7] backdrop-blur-md border border-primary/60 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
                        Coming Soon
                      </div>
                    )}
                  </div>
                  <CardHeader className="pb-2 px-4 pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${levelColors[course.level] ?? ""}`}>{course.level}</span>
                      <span className="text-xs text-muted-foreground truncate">{course.category}</span>
                    </div>
                    <h3 className="font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2 text-sm md:text-base">{course.title}</h3>
                  </CardHeader>
                  <CardContent className="px-4 pb-2">
                    <p className="text-sm text-muted-foreground line-clamp-2">{course.description}</p>
                    <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                      <span>{Math.round(course.durationMinutes / 60)}h of content</span>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-0 px-4 pb-4">
                    <div className="flex items-center justify-between w-full">
                      <div>
                        <span className="text-xl font-bold text-foreground">₹{course.price}</span>
                        {course.compareAtPrice && (
                          <span className="text-xs text-muted-foreground line-through ml-2">₹{course.compareAtPrice}</span>
                        )}
                      </div>
                      <Button size="sm" className="text-xs h-8 px-4">View details</Button>
                    </div>
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
