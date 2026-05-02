import { pgTable, text, serial, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const coursesTable = pgTable("courses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  category: text("category").notNull(),
  level: text("level", { enum: ["beginner", "intermediate", "advanced"] }).notNull().default("beginner"),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  tag: text("tag", { enum: ["coming_soon"] }),
  durationMinutes: integer("duration_minutes").notNull().default(0),
  compareAtPrice: numeric("compare_at_price", { precision: 10, scale: 2 }),
  showOnWebsite: boolean("show_on_website").notNull().default(true),
  // Optional course author/creator (FK → creators.id). Nullable so legacy
  // courses without an assigned creator keep working — those simply don't
  // generate a creator-commission row on sale. Set via admin → Courses →
  // Edit → Creator dropdown. `ON DELETE SET NULL` (declared in runtime
  // migration) so revoking/deleting a creator doesn't cascade away their
  // courses; admin can re-assign.
  creatorId: integer("creator_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const modulesTable = pgTable("modules", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => coursesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lessonsTable = pgTable("lessons", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => modulesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type", { enum: ["video", "text", "pdf", "quiz", "link", "embed"] }).notNull().default("video"),
  videoUrl: text("video_url"),
  content: text("content"),
  resourceUrl: text("resource_url"),
  durationMinutes: integer("duration_minutes"),
  order: integer("order").notNull().default(0),
  isFree: text("is_free").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCourseSchema = createInsertSchema(coursesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof coursesTable.$inferSelect;

export const insertModuleSchema = createInsertSchema(modulesTable).omit({ id: true, createdAt: true });
export type InsertModule = z.infer<typeof insertModuleSchema>;
export type Module = typeof modulesTable.$inferSelect;

export const insertLessonSchema = createInsertSchema(lessonsTable).omit({ id: true, createdAt: true });
export type InsertLesson = z.infer<typeof insertLessonSchema>;
export type Lesson = typeof lessonsTable.$inferSelect;
