import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable, modulesTable, lessonsTable, enrollmentsTable, lessonCompletionsTable } from "@workspace/db";
import { eq, and, count, sql, ilike, or } from "drizzle-orm";
import { requireAuth, requireAdmin, type JwtPayload } from "../middlewares/auth";
import type { Request } from "express";

const router = Router();

type AuthedRequest = Request & { user: JwtPayload };

router.get("/", async (req, res): Promise<void> => {
  const { category, search, limit = "20", offset = "0" } = req.query as Record<string, string>;
  const conditions = [eq(coursesTable.status, "published"), eq(coursesTable.showOnWebsite, true)];
  if (category) conditions.push(eq(coursesTable.category, category));
  if (search) conditions.push(or(ilike(coursesTable.title, `%${search}%`), ilike(coursesTable.description, `%${search}%`))!);

  const [courses, totalResult] = await Promise.all([
    db.select().from(coursesTable).where(and(...conditions)).limit(parseInt(limit)).offset(parseInt(offset)),
    db.select({ count: count() }).from(coursesTable).where(and(...conditions)),
  ]);

  const enriched = await Promise.all(courses.map(async (c) => {
    const [moduleResult, enrollResult] = await Promise.all([
      db.select({ count: count() }).from(modulesTable).where(eq(modulesTable.courseId, c.id)),
      db.select({ count: count() }).from(enrollmentsTable).where(eq(enrollmentsTable.courseId, c.id)),
    ]);
    const lessonResult = await db.select({ count: count() }).from(lessonsTable)
      .innerJoin(modulesTable, eq(lessonsTable.moduleId, modulesTable.id))
      .where(eq(modulesTable.courseId, c.id));
    return {
      ...c,
      price: parseFloat(c.price),
      compareAtPrice: c.compareAtPrice ? parseFloat(c.compareAtPrice) : null,
      moduleCount: moduleResult[0]?.count ?? 0,
      lessonCount: lessonResult[0]?.count ?? 0,
      enrollmentCount: enrollResult[0]?.count ?? 0,
    };
  }));

  res.json({ courses: enriched, total: totalResult[0]?.count ?? 0 });
});

router.post("/", requireAdmin, async (req, res): Promise<void> => {
  const { title, description, thumbnailUrl, price, compareAtPrice, durationMinutes, category, level, status, tag, creatorId } = req.body;
  const [course] = await db.insert(coursesTable).values({
    title, description, thumbnailUrl, price: String(price || 0),
    compareAtPrice: compareAtPrice ? String(parseFloat(compareAtPrice)) : null,
    durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : 0,
    category, level: level || "beginner", status: status || "draft",
    tag: tag === "coming_soon" ? "coming_soon" : null,
    // Optional: assign a creator at create-time (defaults to null; can be set later via PUT).
    creatorId: creatorId != null && creatorId !== "" ? parseInt(String(creatorId), 10) : null,
  }).returning();
  res.status(201).json({ ...course, price: parseFloat(course.price), compareAtPrice: course.compareAtPrice ? parseFloat(course.compareAtPrice) : null, moduleCount: 0, lessonCount: 0, enrollmentCount: 0 });
});

router.get("/:courseId", async (req, res): Promise<void> => {
  const courseId = parseInt(req.params.courseId);
  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, courseId)).limit(1);
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  const modules = await db.select().from(modulesTable).where(eq(modulesTable.courseId, courseId)).orderBy(modulesTable.order);

  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  let isEnrolled = false;
  let completedLessonIds = new Set<number>();
  if (token) {
    try {
      const { verifyToken } = await import("../middlewares/auth");
      const payload = verifyToken(token);
      const [enrollment, completions] = await Promise.all([
        db.select().from(enrollmentsTable).where(and(eq(enrollmentsTable.userId, payload.userId), eq(enrollmentsTable.courseId, courseId))).limit(1),
        db.select({ lessonId: lessonCompletionsTable.lessonId }).from(lessonCompletionsTable).where(eq(lessonCompletionsTable.userId, payload.userId)),
      ]);
      isEnrolled = enrollment.length > 0;
      completedLessonIds = new Set(completions.map(c => c.lessonId));
    } catch {}
  }

  const modulesWithLessons = await Promise.all(modules.map(async (m) => {
    const lessons = await db.select().from(lessonsTable).where(eq(lessonsTable.moduleId, m.id)).orderBy(lessonsTable.order);
    return { ...m, lessons: lessons.map(l => ({ ...l, isFree: l.isFree === "true", isCompleted: completedLessonIds.has(l.id) })) };
  }));

  const [enrollResult] = await db.select({ count: count() }).from(enrollmentsTable).where(eq(enrollmentsTable.courseId, courseId));
  res.json({ ...course, price: parseFloat(course.price), compareAtPrice: course.compareAtPrice ? parseFloat(course.compareAtPrice) : null, modules: modulesWithLessons, isEnrolled, moduleCount: modules.length, lessonCount: modulesWithLessons.reduce((a, m) => a + m.lessons.length, 0), enrollmentCount: enrollResult?.count ?? 0 });
});

router.put("/:courseId", requireAdmin, async (req, res): Promise<void> => {
  const courseId = parseInt(req.params.courseId);
  const { title, description, thumbnailUrl, price, compareAtPrice, durationMinutes, category, level, status, showOnWebsite, tag, creatorId } = req.body;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = { title, description, thumbnailUrl, category, level, status, showOnWebsite };
  if (price !== undefined) updates.price = String(price);
  if (compareAtPrice !== undefined) updates.compareAtPrice = compareAtPrice ? String(parseFloat(compareAtPrice)) : null;
  if (durationMinutes !== undefined) updates.durationMinutes = parseInt(durationMinutes, 10);
  if (tag !== undefined) updates.tag = tag === "coming_soon" ? "coming_soon" : null;
  // Creator picker: empty string / null clears the assignment, a numeric id sets it.
  if (creatorId !== undefined) {
    updates.creatorId = creatorId === null || creatorId === "" ? null : parseInt(String(creatorId), 10);
  }
  const [updated] = await db.update(coursesTable).set(updates).where(eq(coursesTable.id, courseId)).returning();
  if (!updated) { res.status(404).json({ error: "Course not found" }); return; }
  res.json({ ...updated, price: parseFloat(updated.price), compareAtPrice: updated.compareAtPrice ? parseFloat(updated.compareAtPrice) : null, moduleCount: 0, lessonCount: 0, enrollmentCount: 0 });
});

router.delete("/:courseId", requireAdmin, async (req, res): Promise<void> => {
  const courseId = parseInt(req.params.courseId);
  await db.delete(coursesTable).where(eq(coursesTable.id, courseId));
  res.json({ message: "Course deleted" });
});

router.get("/:courseId/modules", async (req, res): Promise<void> => {
  const courseId = parseInt(req.params.courseId);
  const modules = await db.select().from(modulesTable).where(eq(modulesTable.courseId, courseId)).orderBy(modulesTable.order);
  const modulesWithLessons = await Promise.all(modules.map(async (m) => {
    const lessons = await db.select().from(lessonsTable).where(eq(lessonsTable.moduleId, m.id)).orderBy(lessonsTable.order);
    return { ...m, lessons: lessons.map(l => ({ ...l, isFree: l.isFree === "true", isCompleted: false })) };
  }));
  res.json(modulesWithLessons);
});

router.post("/:courseId/modules", requireAdmin, async (req, res): Promise<void> => {
  const courseId = parseInt(req.params.courseId);
  const { title, description, order } = req.body;
  const [module] = await db.insert(modulesTable).values({ courseId, title, description, order: order || 0 }).returning();
  res.status(201).json({ ...module, lessons: [] });
});

router.put("/:courseId/modules/:moduleId", requireAdmin, async (req, res): Promise<void> => {
  const moduleId = parseInt(req.params.moduleId);
  const { title, description, order } = req.body;
  const [updated] = await db.update(modulesTable).set({ title, description, order }).where(eq(modulesTable.id, moduleId)).returning();
  res.json({ ...updated, lessons: [] });
});

router.delete("/:courseId/modules/:moduleId", requireAdmin, async (req, res): Promise<void> => {
  const moduleId = parseInt(req.params.moduleId);
  await db.delete(modulesTable).where(eq(modulesTable.id, moduleId));
  res.json({ message: "Module deleted" });
});

router.get("/:courseId/modules/:moduleId/lessons", async (req, res): Promise<void> => {
  const moduleId = parseInt(req.params.moduleId);
  const lessons = await db.select().from(lessonsTable).where(eq(lessonsTable.moduleId, moduleId)).orderBy(lessonsTable.order);
  res.json(lessons.map(l => ({ ...l, isFree: l.isFree === "true", isCompleted: false })));
});

router.post("/:courseId/modules/:moduleId/lessons", requireAdmin, async (req, res): Promise<void> => {
  const moduleId = parseInt(req.params.moduleId);
  const { title, description, type, videoUrl, content, resourceUrl, durationMinutes, order, isFree } = req.body;
  const [lesson] = await db.insert(lessonsTable).values({
    moduleId, title, description, type: type || "video", videoUrl, content, resourceUrl,
    durationMinutes, order: order || 0, isFree: isFree ? "true" : "false"
  }).returning();
  res.status(201).json({ ...lesson, isFree: lesson.isFree === "true", isCompleted: false });
});

router.get("/:courseId/modules/:moduleId/lessons/:lessonId", requireAuth, async (req, res): Promise<void> => {
  const lessonId = parseInt(req.params.lessonId);
  const authedReq = req as AuthedRequest;
  const [lesson] = await db.select().from(lessonsTable).where(eq(lessonsTable.id, lessonId)).limit(1);
  if (!lesson) { res.status(404).json({ error: "Lesson not found" }); return; }

  const courseId = parseInt(req.params.courseId);
  const [enrollment] = await db.select().from(enrollmentsTable).where(and(eq(enrollmentsTable.userId, authedReq.user.userId), eq(enrollmentsTable.courseId, courseId))).limit(1);
  if (!enrollment && lesson.isFree !== "true" && authedReq.user.role !== "admin") {
    res.status(403).json({ error: "Not enrolled in this course" }); return;
  }

  const [completion] = await db.select().from(lessonCompletionsTable).where(and(eq(lessonCompletionsTable.userId, authedReq.user.userId), eq(lessonCompletionsTable.lessonId, lessonId))).limit(1);
  res.json({ ...lesson, isFree: lesson.isFree === "true", isCompleted: !!completion });
});

router.put("/:courseId/modules/:moduleId/lessons/:lessonId", requireAdmin, async (req, res): Promise<void> => {
  const lessonId = parseInt(req.params.lessonId);
  const { title, description, type, videoUrl, content, resourceUrl, durationMinutes, order, isFree } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (type !== undefined) updates.type = type;
  if (videoUrl !== undefined) updates.videoUrl = videoUrl;
  if (content !== undefined) updates.content = content;
  if (resourceUrl !== undefined) updates.resourceUrl = resourceUrl;
  if (durationMinutes !== undefined) updates.durationMinutes = durationMinutes;
  if (order !== undefined) updates.order = order;
  if (isFree !== undefined) updates.isFree = isFree ? "true" : "false";
  const [updated] = await db.update(lessonsTable).set(updates).where(eq(lessonsTable.id, lessonId)).returning();
  res.json({ ...updated, isFree: updated.isFree === "true", isCompleted: false });
});

router.delete("/:courseId/modules/:moduleId/lessons/:lessonId", requireAdmin, async (req, res): Promise<void> => {
  const lessonId = parseInt(req.params.lessonId);
  await db.delete(lessonsTable).where(eq(lessonsTable.id, lessonId));
  res.json({ message: "Lesson deleted" });
});

export default router;
