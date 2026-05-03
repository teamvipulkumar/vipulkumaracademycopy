import app from "./app";
import { logger } from "./lib/logger";
import { processSequences, processScheduledCampaigns } from "./routes/crm";
import { runCreatorPayoutCycle } from "./routes/creators";
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
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS last_creator_payout_cycle_at timestamptz`);
    // Creator KYC redesign: capture name-as-per-PAN + uploaded PAN front image.
    await db.execute(sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS pan_name text`);
    await db.execute(sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS pan_front_url text`);

    /* ── Creator panel + revenue-share commission system ─────────────────── */
    // Creators table — like admin_staff but for external course authors.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS creators (
        id serial PRIMARY KEY,
        user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL,
        email text NOT NULL,
        pan_number text,
        id_proof_url text,
        address_proof_url text,
        kyc_status text NOT NULL DEFAULT 'pending',
        kyc_admin_note text,
        kyc_reviewed_at timestamptz,
        account_holder_name text,
        account_number text,
        ifsc_code text,
        bank_name text,
        upi_id text,
        preferred_payment_method text DEFAULT 'bank',
        status text NOT NULL DEFAULT 'active',
        invited_by integer REFERENCES users(id) ON DELETE SET NULL,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    // FK from courses.creator_id → creators.id (added separately because the
    // schema declares the column without a Drizzle reference — we attach the
    // constraint here to keep migrations idempotent).
    await db.execute(sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS creator_id integer`);
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'courses_creator_id_fkey'
        ) THEN
          ALTER TABLE courses
            ADD CONSTRAINT courses_creator_id_fkey
            FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS courses_creator_id_idx ON courses(creator_id)`);

    // Payout batches (system-released on Saturday OR admin manual trigger)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS creator_payouts (
        id serial PRIMARY KEY,
        creator_id integer NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount numeric(10, 2) NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        release_date timestamptz NOT NULL DEFAULT now(),
        paid_at timestamptz,
        released_by integer REFERENCES users(id) ON DELETE SET NULL,
        released_by_system boolean NOT NULL DEFAULT false,
        payment_method text,
        payment_reference text,
        failure_reason text,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS creator_payouts_creator_id_idx ON creator_payouts(creator_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS creator_payouts_status_idx ON creator_payouts(status)`);

    // Per-course commission ledger (one row per (sale, course-with-creator))
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS creator_commissions (
        id serial PRIMARY KEY,
        creator_id integer NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        payment_id integer NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
        course_id integer REFERENCES courses(id) ON DELETE SET NULL,
        bundle_id integer REFERENCES bundles(id) ON DELETE SET NULL,
        sale_amount_share numeric(10, 2) NOT NULL,
        commission_percent numeric(5, 2) NOT NULL DEFAULT 25,
        commission_amount numeric(10, 2) NOT NULL,
        status text NOT NULL DEFAULT 'earned',
        payout_id integer REFERENCES creator_payouts(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS creator_commissions_creator_id_idx ON creator_commissions(creator_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS creator_commissions_payment_id_idx ON creator_commissions(payment_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS creator_commissions_status_idx ON creator_commissions(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS creator_commissions_payout_id_idx ON creator_commissions(payout_id)`);
    // Idempotency guard: at most ONE commission row per (payment, course). Concurrent
    // payment completion handlers (verify + webhook + bundle path) would otherwise
    // race to double-insert — this unique index makes any such race a no-op via
    // ON CONFLICT DO NOTHING in the insert helper.
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS creator_commissions_payment_course_uniq ON creator_commissions(payment_id, course_id)`);

    // Reconcile CHECK constraints on email_templates.type and email_automation_rules.event
    // so newly added enum values (e.g. "staff_welcome") are accepted at runtime before the
    // next drizzle-kit push. We only drop a constraint when:
    //   (a) it is on the specific column we care about (`type` for templates, `event` for rules)
    //   (b) AND its existing definition does NOT already permit the new value
    // This keeps DB-level validation in place wherever it already covers staff_welcome,
    // and avoids accidentally dropping unrelated CHECKs that happen to mention "welcome".
    await db.execute(sql`
      DO $$
      DECLARE c record;
      BEGIN
        FOR c IN
          SELECT conrelid::regclass::text AS tbl, conname,
                 pg_get_constraintdef(oid) AS def
          FROM pg_constraint
          WHERE contype = 'c'
            AND (
              (conrelid = 'public.email_templates'::regclass         AND pg_get_constraintdef(oid) ~* '\\mtype\\M'  AND pg_get_constraintdef(oid) ~* '\\mwelcome\\M') OR
              (conrelid = 'public.email_automation_rules'::regclass  AND pg_get_constraintdef(oid) ~* '\\mevent\\M' AND pg_get_constraintdef(oid) ~* '\\mwelcome\\M')
            )
            AND (
              pg_get_constraintdef(oid) !~* '\\mstaff_welcome\\M' OR
              pg_get_constraintdef(oid) !~* '\\mcreator_kyc_submitted\\M' OR
              pg_get_constraintdef(oid) !~* '\\maffiliate_kyc_submitted\\M'
            )
        LOOP
          EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', c.tbl, c.conname);
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

    // Saturday creator-payout auto-cycle. Hourly tick is idempotent: only the
    // first tick of any given Saturday IST actually performs work; subsequent
    // ticks short-circuit on lastCreatorPayoutCycleAt. Also fires once at
    // boot to handle the case where the server was restarted on Saturday.
    const runCreatorCycle = async () => {
      try {
        const r = await runCreatorPayoutCycle();
        if (r.ran) logger.info({ payoutIds: r.payoutIds }, "Saturday creator payout cycle ran");
      } catch (e) {
        logger.warn({ e }, "Creator payout cycle error (non-fatal)");
      }
    };
    runCreatorCycle();
    setInterval(runCreatorCycle, 60 * 60 * 1000);
  });
});
