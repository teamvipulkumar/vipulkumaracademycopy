import { pgTable, text, serial, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { coursesTable } from "./courses";
import { paymentsTable } from "./payments";
import { bundlesTable } from "./bundles";

/**
 * Creators are external course authors who supply courses to the platform.
 * Like `admin_staff`, this table is the SOURCE OF TRUTH for creator status
 * — the underlying `users.role` is NOT mutated. A user is "a creator" iff
 * they have an active row here. Admin marks a user as a creator via the
 * admin panel; the user keeps their normal account but unlocks `/creator/*`.
 *
 * Revenue model (see `recordCreatorCommissions`):
 *   • Total creator pool = 25% of every sale (single course OR bundle).
 *   • For a single-course sale: full 25% goes to that course's creator.
 *   • For a bundle of N courses: 25% / N to each course's creator
 *     (per-course split; if the same creator owns 2 of 4 courses they
 *     receive 2 × 25%/4 = 12.5%).
 *   • Affiliate (if any) takes their commission group rate (capped at 50%).
 *   • Platform = 100% − affiliate − creator pool. With no affiliate, the
 *     unused 50% goes to platform (NOT to the creator).
 */
export const creatorsTable = pgTable("creators", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),

  // KYC documents (creator-uploaded; admin reviews)
  // panName = "Name as per PAN card" (must match the legal name on the PAN).
  // panFrontUrl = uploaded image (front side) of the PAN card itself.
  // idProofUrl/addressProofUrl kept as legacy/optional secondary documents.
  panName: text("pan_name"),
  panNumber: text("pan_number"),
  panFrontUrl: text("pan_front_url"),
  idProofUrl: text("id_proof_url"),
  addressProofUrl: text("address_proof_url"),
  kycStatus: text("kyc_status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  kycAdminNote: text("kyc_admin_note"),
  kycReviewedAt: timestamp("kyc_reviewed_at", { withTimezone: true }),

  // Payout details (creator-edited)
  accountHolderName: text("account_holder_name"),
  accountNumber: text("account_number"),
  ifscCode: text("ifsc_code"),
  bankName: text("bank_name"),
  upiId: text("upi_id"),
  preferredPaymentMethod: text("preferred_payment_method", { enum: ["bank", "upi"] }).default("bank"),

  // Lifecycle
  status: text("status", { enum: ["active", "revoked"] }).notNull().default("active"),
  invitedBy: integer("invited_by").references(() => usersTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/**
 * Payout batches (one row = one Saturday auto-cycle release for a single
 * creator OR one admin-triggered manual release). Status starts as
 * "pending" — admin then enters the txn reference and marks "paid".
 */
export const creatorPayoutsTable = pgTable("creator_payouts", {
  id: serial("id").primaryKey(),
  creatorId: integer("creator_id").notNull().references(() => creatorsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status", { enum: ["pending", "paid", "failed", "cancelled"] }).notNull().default("pending"),
  releaseDate: timestamp("release_date", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  releasedBy: integer("released_by").references(() => usersTable.id, { onDelete: "set null" }),
  releasedBySystem: boolean("released_by_system").notNull().default(false),
  paymentMethod: text("payment_method", { enum: ["bank", "upi", "manual"] }),
  paymentReference: text("payment_reference"),
  failureReason: text("failure_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/**
 * Per-course commission ledger. One row per (sale, courseId-with-creator).
 *
 *   status flow:
 *     "earned"  — recorded but not yet in any payout batch
 *     "paid"    — payout marked paid by admin (txn ref recorded)
 *     "cancelled" — original payment refunded (reversed)
 *
 *   payoutId is set when the row is grouped into a payout batch
 *   (auto-Saturday cycle or admin manual release). Status remains "earned"
 *   while the payout is "pending"; flips to "paid" only when payout.status
 *   becomes "paid".
 */
export const creatorCommissionsTable = pgTable("creator_commissions", {
  id: serial("id").primaryKey(),
  creatorId: integer("creator_id").notNull().references(() => creatorsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  paymentId: integer("payment_id").notNull().references(() => paymentsTable.id, { onDelete: "cascade" }),
  courseId: integer("course_id").references(() => coursesTable.id, { onDelete: "set null" }),
  bundleId: integer("bundle_id").references(() => bundlesTable.id, { onDelete: "set null" }),
  // The portion of the sale attributed to this course (sale total / course count for bundles, full sale for single)
  saleAmountShare: numeric("sale_amount_share", { precision: 10, scale: 2 }).notNull(),
  commissionPercent: numeric("commission_percent", { precision: 5, scale: 2 }).notNull().default("25"),
  commissionAmount: numeric("commission_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status", { enum: ["earned", "paid", "cancelled"] }).notNull().default("earned"),
  payoutId: integer("payout_id").references(() => creatorPayoutsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCreatorSchema = createInsertSchema(creatorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCreator = z.infer<typeof insertCreatorSchema>;
export type Creator = typeof creatorsTable.$inferSelect;

export const insertCreatorPayoutSchema = createInsertSchema(creatorPayoutsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCreatorPayout = z.infer<typeof insertCreatorPayoutSchema>;
export type CreatorPayout = typeof creatorPayoutsTable.$inferSelect;

export const insertCreatorCommissionSchema = createInsertSchema(creatorCommissionsTable).omit({ id: true, createdAt: true });
export type InsertCreatorCommission = z.infer<typeof insertCreatorCommissionSchema>;
export type CreatorCommission = typeof creatorCommissionsTable.$inferSelect;
