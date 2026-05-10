import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "student", "affiliate"] }).notNull().default("student"),
  avatarUrl: text("avatar_url"),
  referralCode: text("referral_code").notNull().unique(),
  isBanned: boolean("is_banned").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerifyToken: text("email_verify_token"),
  emailVerifyTokenExpiresAt: timestamp("email_verify_token_expires_at", { withTimezone: true }),
  phone: text("phone"),
  resetToken: text("reset_token"),
  resetTokenExpiresAt: timestamp("reset_token_expires_at", { withTimezone: true }),
  emailUnsubscribedAt: timestamp("email_unsubscribed_at", { withTimezone: true }),
  affiliateFeePaidAt: timestamp("affiliate_fee_paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
