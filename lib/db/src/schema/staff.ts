import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export interface StaffPermissions {
  dashboard: boolean;
  orders: boolean;
  enrollments: boolean;
  coupons: boolean;
  affiliates: boolean;
  payouts: boolean;
  courses: boolean;
  pages: boolean;
  files: boolean;
  users: boolean;
  crm: boolean;
  paymentGateways: boolean;
  gstInvoicing: boolean;
  settings: boolean;
  /** Manage course creators + creator commission payouts. */
  creators: boolean;
}

export const DEFAULT_PERMISSIONS: StaffPermissions = {
  dashboard: true,
  orders: false,
  enrollments: false,
  coupons: false,
  affiliates: false,
  payouts: false,
  courses: false,
  pages: false,
  files: false,
  users: false,
  crm: false,
  paymentGateways: false,
  gstInvoicing: false,
  settings: false,
  creators: false,
};

export const PRESET_ROLES: Record<string, { label: string; permissions: StaffPermissions }> = {
  content_manager: {
    label: "Content Manager",
    permissions: { ...DEFAULT_PERMISSIONS, courses: true, pages: true, files: true },
  },
  sales_manager: {
    label: "Sales Manager",
    permissions: { ...DEFAULT_PERMISSIONS, orders: true, enrollments: true, coupons: true, affiliates: true },
  },
  support_agent: {
    label: "Support Agent",
    permissions: { ...DEFAULT_PERMISSIONS, users: true, orders: true, enrollments: true },
  },
  affiliate_manager: {
    label: "Affiliate Manager",
    permissions: { ...DEFAULT_PERMISSIONS, affiliates: true, payouts: true },
  },
  finance_manager: {
    label: "Finance Manager",
    permissions: { ...DEFAULT_PERMISSIONS, orders: true, paymentGateways: true, gstInvoicing: true },
  },
  full_access: {
    label: "Full Access",
    permissions: {
      dashboard: true, orders: true, enrollments: true, coupons: true, affiliates: true,
      payouts: true, courses: true, pages: true, files: true, users: true,
      crm: true, paymentGateways: true, gstInvoicing: true, settings: true,
      creators: true,
    },
  },
};

export const adminStaffTable = pgTable("admin_staff", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  roleName: text("role_name").notNull(),
  permissions: jsonb("permissions").notNull().$type<StaffPermissions>(),
  previousRole: text("previous_role").notNull().default("student"),
  status: text("status", { enum: ["active", "revoked"] }).notNull().default("active"),
  invitedBy: integer("invited_by").references(() => usersTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AdminStaff = typeof adminStaffTable.$inferSelect;
export type InsertAdminStaff = typeof adminStaffTable.$inferInsert;
