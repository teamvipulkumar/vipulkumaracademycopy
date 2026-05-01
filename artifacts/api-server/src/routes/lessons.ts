import { Router } from "express";
import { db } from "@workspace/db";
import { lessonCompletionsTable, lessonsTable, modulesTable, enrollmentsTable, coursesTable, usersTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireAuth, type JwtPayload } from "../middlewares/auth";
import type { Request } from "express";
import { triggerAutomation, triggerFunnel, getPublicBaseUrl, publicSiteUrlFromRequest } from "./crm";

const router = Router();
type AuthedRequest = Request & { user: JwtPayload };

router.post("/:lessonId/complete", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const lessonId = parseInt(req.params.lessonId);

  const existing = await db.select().from(lessonCompletionsTable).where(and(eq(lessonCompletionsTable.userId, authedReq.user.userId), eq(lessonCompletionsTable.lessonId, lessonId))).limit(1);
  if (existing.length === 0) {
    await db.insert(lessonCompletionsTable).values({ userId: authedReq.user.userId, lessonId });
    // Prefer the live request hostname (allowlisted via `publicSiteUrlFromRequest`)
    // so the funnel email link points at the exact domain the learner is on.
    // Fall back to the unified helper chain (admin siteUrl → auto-learned host
    // → env) for the rare local/disallowed-host case.
    const siteUrl = publicSiteUrlFromRequest(req) || await getPublicBaseUrl();
    triggerFunnel("lesson_completed", authedReq.user.userId, { site_url: siteUrl }).catch(() => {});
  }

  // Check if course is fully completed
  const [lesson] = await db.select({ moduleId: lessonsTable.moduleId }).from(lessonsTable).where(eq(lessonsTable.id, lessonId)).limit(1);
  if (lesson) {
    const [mod] = await db.select({ courseId: modulesTable.courseId }).from(modulesTable).where(eq(modulesTable.id, lesson.moduleId)).limit(1);
    if (mod) {
      const courseId = mod.courseId;

      // Count total lessons in course
      const [totalResult] = await db
        .select({ count: count() })
        .from(lessonsTable)
        .innerJoin(modulesTable, eq(lessonsTable.moduleId, modulesTable.id))
        .where(eq(modulesTable.courseId, courseId));
      const total = totalResult?.count ?? 0;

      // Count completed lessons in course for this user
      const [doneResult] = await db
        .select({ count: count() })
        .from(lessonCompletionsTable)
        .innerJoin(lessonsTable, eq(lessonCompletionsTable.lessonId, lessonsTable.id))
        .innerJoin(modulesTable, eq(lessonsTable.moduleId, modulesTable.id))
        .where(and(eq(lessonCompletionsTable.userId, authedReq.user.userId), eq(modulesTable.courseId, courseId)));
      const done = doneResult?.count ?? 0;

      if (total > 0 && done >= total) {
        // Mark enrollment as completed (only if not already)
        const [enrollment] = await db.select().from(enrollmentsTable)
          .where(and(eq(enrollmentsTable.userId, authedReq.user.userId), eq(enrollmentsTable.courseId, courseId)))
          .limit(1);
        if (enrollment && !enrollment.completedAt) {
          await db.update(enrollmentsTable)
            .set({ completedAt: new Date() })
            .where(eq(enrollmentsTable.id, enrollment.id));

          // Fire completion automation
          const [user] = await db.select().from(usersTable).where(eq(usersTable.id, authedReq.user.userId)).limit(1);
          const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, courseId)).limit(1);
          if (user && course) {
            triggerAutomation("completion", user.id, user.email, {
              name: user.name,
              email: user.email,
              course_name: course.title,
            }).catch(() => {});
            // Pass empty site_url so the funnel processor's fallback fills it
            // via getPublicBaseUrl() (admin Site URL → auto-learned host → env).
            // No need to compute it here per-request.
            triggerFunnel("course_completed", user.id, { course_name: course.title }).catch(() => {});
          }
        }
      }
    }
  }

  res.json({ message: "Lesson marked as complete" });
});

export default router;
