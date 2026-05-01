import pg from '/home/runner/workspace/lib/db/node_modules/pg/lib/index.js';
const { Client } = pg;
const c = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL });
await c.connect();
const r = await c.query(`SELECT email, role, referral_code FROM users WHERE role IN ('affiliate','admin') ORDER BY role LIMIT 10`);
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
