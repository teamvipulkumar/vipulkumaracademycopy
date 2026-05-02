import { pgTable, serial, timestamp, integer, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type", { enum: ["info", "success", "warning", "error"] }).notNull().default("info"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const platformSettingsTable = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  siteName: text("site_name").notNull().default("EduPro"),
  siteDescription: text("site_description").notNull().default("Learn and grow with our courses"),
  commissionRate: integer("commission_rate").notNull().default(20),
  currency: text("currency").notNull().default("USD"),
  stripeEnabled: boolean("stripe_enabled").notNull().default(true),
  razorpayEnabled: boolean("razorpay_enabled").notNull().default(false),
  emailNotificationsEnabled: boolean("email_notifications_enabled").notNull().default(true),
  affiliateEnabled: boolean("affiliate_enabled").notNull().default(true),
  affiliateCookieDays: integer("affiliate_cookie_days").notNull().default(30),
  affiliateMinPayout: integer("affiliate_min_payout").notNull().default(500),
  payoutPeriodDays: integer("payout_period_days").notNull().default(7),
  payoutWeekDay: integer("payout_week_day"),
  googleSignInEnabled: boolean("google_sign_in_enabled").notNull().default(false),
  googleClientId: text("google_client_id"),
  googleClientSecret: text("google_client_secret"),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  maintenanceMessage: text("maintenance_message"),
  orderPrefix: text("order_prefix").notNull().default("ORD"),
  orderSuffix: text("order_suffix").notNull().default(""),
  showFeaturedCourses: boolean("show_featured_courses").notNull().default(true),
  showFeaturedPackages: boolean("show_featured_packages").notNull().default(true),
  facebookPixelEnabled: boolean("facebook_pixel_enabled").notNull().default(false),
  facebookPixelId: text("facebook_pixel_id"),
  facebookAccessToken: text("facebook_access_token"),
  facebookPixelBaseCode: text("facebook_pixel_base_code"),
  // Optional Test Event Code from Meta's Test Events tool. When set, every
  // CAPI dispatch is tagged so events show in Events Manager → Test Events
  // (instead of being counted in production). Clear this field to go live.
  facebookTestEventCode: text("facebook_test_event_code"),
  siteUrl: text("site_url").notNull().default(""),
  siteLogo: text("site_logo"),
  logoSize: integer("logo_size").notNull().default(34),
  logoSizeMobile: integer("logo_size_mobile").notNull().default(28),
  favicon: text("favicon"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  emailLogRetentionDays: integer("email_log_retention_days"),
  // Tracks the last time the Saturday creator-payout cycle ran (any tz).
  // We store this on the singleton platform_settings row so a clustered
  // setup can dedupe the cycle: only the first server to see "today is
  // Saturday IST AND lastCreatorPayoutCycleAt < today-IST 00:00" runs it.
  lastCreatorPayoutCycleAt: timestamp("last_creator_payout_cycle_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
