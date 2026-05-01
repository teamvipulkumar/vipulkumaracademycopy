import bcrypt from 'bcryptjs';
import pg from '/home/runner/workspace/lib/db/node_modules/pg/lib/index.js';
const { Client } = pg;
const c = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL });
await c.connect();
const hash = await bcrypt.hash("BobTest123!", 10);
const r = await c.query(`UPDATE users SET password = $1 WHERE email = 'bob@edupro.com' RETURNING email, role, referral_code`, [hash]);
console.log(JSON.stringify(r.rows));
await c.end();
