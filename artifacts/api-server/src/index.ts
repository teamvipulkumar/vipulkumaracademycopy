import app from "./app";
import { logger } from "./lib/logger";
import { processSequences, processScheduledCampaigns } from "./routes/crm";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runMigrations() {
  try {
    await db.execute(sql`ALTER TABLE automation_funnels ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS site_url text NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS html_body text`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS email_log_retention_days integer`);

    // Loosen CHECK constraints on email_templates.type and email_automation_rules.event
    // so newly added enum values (e.g. "staff_welcome") are accepted at runtime
    // before the next drizzle-kit push. The TypeScript enum still gates writes.
    await db.execute(sql`
      DO $$
      DECLARE c record;
      BEGIN
        FOR c IN
          SELECT conrelid::regclass::text AS tbl, conname FROM pg_constraint
          WHERE contype = 'c'
            AND conrelid IN ('public.email_templates'::regclass, 'public.email_automation_rules'::regclass)
            AND pg_get_constraintdef(oid) ~* 'welcome'
        LOOP
          EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
        END LOOP;
      END $$;
    `);

    // Funnel execution tracking (per-user runs through automation funnels)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS funnel_executions (
        id serial PRIMARY KEY,
        funnel_id integer NOT NULL REFERENCES automation_funnels(id) ON DELETE CASCADE,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'running',
        current_step_order integer NOT NULL DEFAULT 0,
        next_action_type text,
        started_at timestamptz NOT NULL DEFAULT now(),
        last_executed_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS funnel_execution_steps (
        id serial PRIMARY KEY,
        execution_id integer NOT NULL REFERENCES funnel_executions(id) ON DELETE CASCADE,
        funnel_step_id integer NOT NULL,
        step_order integer NOT NULL,
        action_type text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        executed_at timestamptz,
        error_message text
      )
    `);
    logger.info("DB migrations OK");
  } catch (e) {
    logger.warn({ e }, "Migration warning (non-fatal)");
  }

  // Enable RLS on all public tables and add explicit deny-all policies for anon/authenticated
  // roles (Supabase PostgREST roles). The API server connects as the postgres superuser
  // which bypasses RLS, so this has zero effect on existing queries.
  // This silences both "RLS Disabled" and "RLS Enabled No Policy" Security Advisor warnings.
  try {
    await db.execute(sql`
      DO $$
      DECLARE
        tbl text;
      BEGIN
        FOR tbl IN
          SELECT tablename FROM pg_tables WHERE schemaname = 'public'
        LOOP
          -- Enable RLS
          EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
          -- Drop old deny policy if exists, then re-create (idempotent)
          EXECUTE format('DROP POLICY IF EXISTS deny_external_access ON public.%I', tbl);
          EXECUTE format(
            'CREATE POLICY deny_external_access ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
            tbl
          );
        END LOOP;
      END
      $$;
    `);
    logger.info("RLS enabled with deny-all policies on all public tables");
  } catch (e) {
    logger.warn({ e }, "RLS migration warning (non-fatal)");
  }

  // Create indexes on all unindexed foreign key columns in the public schema.
  // Only counts a column as "indexed" if it is the LEADING column of some index
  // (composite indexes where the FK col is not first do NOT help FK lookups).
  // Fixes Supabase Performance Advisor "Unindexed foreign keys" suggestions.
  try {
    await db.execute(sql`
      DO $$
      DECLARE
        r RECORD;
        idx_name text;
      BEGIN
        FOR r IN
          WITH fk_cols AS (
            SELECT c.conrelid AS tbl, UNNEST(c.conkey) AS col
            FROM pg_constraint c
            WHERE c.contype = 'f'
              AND c.conrelid IN (
                SELECT oid FROM pg_class
                WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
                  AND relkind = 'r'
              )
          ),
          -- Only the FIRST column of each index counts as a covering index for FK lookups
          leading_indexed_cols AS (
            SELECT indrelid,
                   (string_to_array(indkey::text, ' '))[1]::smallint AS col
            FROM pg_index
          )
          SELECT DISTINCT
            pc.relname AS table_name,
            pa.attname AS column_name
          FROM fk_cols f
          JOIN pg_class     pc ON pc.oid       = f.tbl
          JOIN pg_attribute pa ON pa.attrelid  = f.tbl AND pa.attnum = f.col
          WHERE NOT EXISTS (
            SELECT 1 FROM leading_indexed_cols lic
            WHERE lic.indrelid = f.tbl AND lic.col = f.col
          )
        LOOP
          idx_name := left('idx_' || r.table_name || '_' || r.column_name, 63);
          EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)',
            idx_name, r.table_name, r.column_name
          );
        END LOOP;
      END
      $$;
    `);
    logger.info("FK indexes created on all public tables");
  } catch (e) {
    logger.warn({ e }, "FK index migration warning (non-fatal)");
  }
}

runMigrations().then(() => {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    setInterval(async () => {
      await processSequences();
      await processScheduledCampaigns();
    }, 10 * 60 * 1000);

    // Auto-delete old email logs based on retention setting (runs every 6 hours)
    const runEmailLogCleanup = async () => {
      try {
        const rows = await db.execute(sql`SELECT email_log_retention_days FROM platform_settings LIMIT 1`);
        const days = (rows.rows[0] as any)?.email_log_retention_days;
        if (days && Number(days) > 0) {
          const result = await db.execute(
            sql`DELETE FROM email_sends WHERE sent_at < NOW() - INTERVAL '1 day' * ${Number(days)}`
          );
          if ((result.rowCount ?? 0) > 0) {
            logger.info({ deleted: result.rowCount, retentionDays: days }, "Auto-deleted old email logs");
          }
        }
      } catch (e) {
        logger.warn({ e }, "Email log cleanup error (non-fatal)");
      }
    };
    runEmailLogCleanup();
    setInterval(runEmailLogCleanup, 6 * 60 * 60 * 1000);
  });
});
