import { pgTable, serial, timestamp, integer, text, boolean, unique, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const smtpSettingsTable = pgTable("smtp_settings", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("Primary SMTP"),
  host: text("host").notNull().default(""),
  port: integer("port").notNull().default(587),
  secure: boolean("secure").notNull().default(false),
  username: text("username").notNull().default(""),
  password: text("password").notNull().default(""),
  fromName: text("from_name").notNull().default("Upcalify"),
  fromEmail: text("from_email").notNull().default(""),
  isActive: boolean("is_active").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const smtpAccountsTable = pgTable("smtp_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("Backup SMTP"),
  host: text("host").notNull().default(""),
  port: integer("port").notNull().default(587),
  secure: boolean("secure").notNull().default(false),
  username: text("username").notNull().default(""),
  password: text("password").notNull().default(""),
  fromName: text("from_name").notNull().default(""),
  fromEmail: text("from_email").notNull().default(""),
  priority: integer("priority").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  lastError: text("last_error"),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const emailTemplatesTable = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", {
    enum: ["welcome", "purchase", "refund", "forgot_password", "remarketing", "completion", "affiliate_commission", "affiliate_application_submitted", "affiliate_application_approved", "affiliate_application_rejected", "affiliate_kyc_submitted", "affiliate_kyc_approved", "affiliate_kyc_rejected", "affiliate_payout_paid", "staff_welcome", "creator_joined", "creator_commission_earned", "creator_payout_paid", "creator_kyc_submitted", "creator_kyc_approved", "creator_kyc_rejected", "custom"],
  }).notNull().default("custom"),
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const emailCampaignsTable = pgTable("email_campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  templateId: integer("template_id").references(() => emailTemplatesTable.id, { onDelete: "set null" }),
  htmlBody: text("html_body").notNull(),
  status: text("status", { enum: ["draft", "scheduled", "sending", "sent", "failed"] }).notNull().default("draft"),
  recipientFilter: text("recipient_filter", { enum: ["all", "enrolled", "not_enrolled", "list", "tag"] }).notNull().default("all"),
  recipientCount: integer("recipient_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  listId: integer("list_id"),
  tagId: integer("tag_id"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailAutomationRulesTable = pgTable("email_automation_rules", {
  id: serial("id").primaryKey(),
  event: text("event", {
    enum: [
      "welcome", "purchase", "refund", "forgot_password", "remarketing", "completion", "affiliate_commission",
      "affiliate_application_submitted", "affiliate_application_approved", "affiliate_application_rejected",
      "staff_welcome",
    ],
  }).notNull().unique(),
  templateId: integer("template_id").references(() => emailTemplatesTable.id, { onDelete: "set null" }),
  isEnabled: boolean("is_enabled").notNull().default(false),
  delayMinutes: integer("delay_minutes").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const emailSendsTable = pgTable("email_sends", {
  id: serial("id").primaryKey(),
  type: text("type", { enum: ["campaign", "automation", "test", "sequence"] }).notNull(),
  campaignId: integer("campaign_id").references(() => emailCampaignsTable.id, { onDelete: "set null" }),
  automationEvent: text("automation_event"),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  htmlBody: text("html_body"),
  status: text("status", { enum: ["sent", "failed"] }).notNull().default("sent"),
  failReason: text("fail_reason"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  trackingToken: text("tracking_token").unique(),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  openCount: integer("open_count").notNull().default(0),
  clickedAt: timestamp("clicked_at", { withTimezone: true }),
  clickCount: integer("click_count").notNull().default(0),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
});

export const emailListsTable = pgTable("email_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  type: text("type", { enum: ["manual", "optin", "enrolled", "all_subscribers"] }).notNull().default("manual"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailListMembersTable = pgTable("email_list_members", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull().references(() => emailListsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subscribedAt: timestamp("subscribed_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─── Contact Tags ─── */
export const contactTagsTable = pgTable("contact_tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#6366f1"),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contactTagAssignmentsTable = pgTable("contact_tag_assignments", {
  id: serial("id").primaryKey(),
  tagId: integer("tag_id").notNull().references(() => contactTagsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("cta_uniq").on(t.tagId, t.userId)]);

/* ─── Email Sequences (Drip) ─── */
export const emailSequencesTable = pgTable("email_sequences", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  trigger: text("trigger", { enum: ["manual", "welcome", "purchase", "completion", "tag_assigned"] }).notNull().default("manual"),
  triggerFilter: text("trigger_filter"),
  isActive: boolean("is_active").notNull().default(false),
  enrolledCount: integer("enrolled_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const emailSequenceStepsTable = pgTable("email_sequence_steps", {
  id: serial("id").primaryKey(),
  sequenceId: integer("sequence_id").notNull().references(() => emailSequencesTable.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull().default(1),
  delayDays: integer("delay_days").notNull().default(0),
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailSequenceEnrollmentsTable = pgTable("email_sequence_enrollments", {
  id: serial("id").primaryKey(),
  sequenceId: integer("sequence_id").notNull().references(() => emailSequencesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  currentStep: integer("current_step").notNull().default(0),
  status: text("status", { enum: ["active", "completed", "cancelled"] }).notNull().default("active"),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  nextSendAt: timestamp("next_send_at", { withTimezone: true }),
}, (t) => [unique("ese_uniq").on(t.sequenceId, t.userId)]);

/* ─── Automation Funnels ─── */
export const automationFunnelsTable = pgTable("automation_funnels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  triggerType: text("trigger_type").notNull().default("user_signup"),
  triggerConfig: jsonb("trigger_config").notNull().default({}),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const automationFunnelStepsTable = pgTable("automation_funnel_steps", {
  id: serial("id").primaryKey(),
  funnelId: integer("funnel_id").notNull().references(() => automationFunnelsTable.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull().default(0),
  actionType: text("action_type").notNull(),
  label: text("label"),
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─── Funnel Execution Tracking (per-user runs through a funnel) ─── */
export const funnelExecutionsTable = pgTable("funnel_executions", {
  id: serial("id").primaryKey(),
  funnelId: integer("funnel_id").notNull().references(() => automationFunnelsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull().default("running"),
  currentStepOrder: integer("current_step_order").notNull().default(0),
  nextActionType: text("next_action_type"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastExecutedAt: timestamp("last_executed_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const funnelExecutionStepsTable = pgTable("funnel_execution_steps", {
  id: serial("id").primaryKey(),
  executionId: integer("execution_id").notNull().references(() => funnelExecutionsTable.id, { onDelete: "cascade" }),
  funnelStepId: integer("funnel_step_id").notNull(),
  stepOrder: integer("step_order").notNull(),
  actionType: text("action_type").notNull(),
  status: text("status", { enum: ["pending", "completed", "failed", "skipped"] }).notNull().default("pending"),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
});

/* ─── Zod schemas & types ─── */
export const insertEmailListSchema = createInsertSchema(emailListsTable).omit({ id: true, createdAt: true });
export type InsertEmailList = z.infer<typeof insertEmailListSchema>;
export type EmailList = typeof emailListsTable.$inferSelect;

export const insertSmtpSettingsSchema = createInsertSchema(smtpSettingsTable).omit({ id: true, updatedAt: true });
export type InsertSmtpSettings = z.infer<typeof insertSmtpSettingsSchema>;
export type SmtpSettings = typeof smtpSettingsTable.$inferSelect;

export const insertSmtpAccountSchema = createInsertSchema(smtpAccountsTable).omit({ id: true, createdAt: true, updatedAt: true, lastError: true, lastTestedAt: true });
export type InsertSmtpAccount = z.infer<typeof insertSmtpAccountSchema>;
export type SmtpAccount = typeof smtpAccountsTable.$inferSelect;

export const insertEmailTemplateSchema = createInsertSchema(emailTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplatesTable.$inferSelect;

export const insertEmailCampaignSchema = createInsertSchema(emailCampaignsTable).omit({ id: true, createdAt: true, sentAt: true, sentCount: true, failedCount: true });
export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;
export type EmailCampaign = typeof emailCampaignsTable.$inferSelect;

export const insertEmailAutomationRuleSchema = createInsertSchema(emailAutomationRulesTable).omit({ id: true, updatedAt: true });
export type InsertEmailAutomationRule = z.infer<typeof insertEmailAutomationRuleSchema>;
export type EmailAutomationRule = typeof emailAutomationRulesTable.$inferSelect;

export const insertEmailSendSchema = createInsertSchema(emailSendsTable).omit({ id: true, sentAt: true });
export type InsertEmailSend = z.infer<typeof insertEmailSendSchema>;
export type EmailSend = typeof emailSendsTable.$inferSelect;

export const insertContactTagSchema = createInsertSchema(contactTagsTable).omit({ id: true, createdAt: true });
export type InsertContactTag = z.infer<typeof insertContactTagSchema>;
export type ContactTag = typeof contactTagsTable.$inferSelect;

export const insertEmailSequenceSchema = createInsertSchema(emailSequencesTable).omit({ id: true, createdAt: true, updatedAt: true, enrolledCount: true });
export type InsertEmailSequence = z.infer<typeof insertEmailSequenceSchema>;
export type EmailSequence = typeof emailSequencesTable.$inferSelect;

export const insertEmailSequenceStepSchema = createInsertSchema(emailSequenceStepsTable).omit({ id: true, createdAt: true });
export type InsertEmailSequenceStep = z.infer<typeof insertEmailSequenceStepSchema>;
export type EmailSequenceStep = typeof emailSequenceStepsTable.$inferSelect;
