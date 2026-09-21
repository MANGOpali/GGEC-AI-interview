import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = process.env.SUPABASE_URL;
const roleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !roleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const client = createClient(url, roleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const defaults = {
  student: { email: 'precas.student.2026@gmail.com', name: 'Test Student', phone: '+2348012345678' },
  counsellor: { email: 'precas.counsellor.2026@gmail.com', name: 'Test Counsellor' },
  admin: { email: 'precas.admin.2026@gmail.com', name: 'Test Admin' },
};
const findUserByEmail = async (email) => {
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
};
const passwordFor = (role) =>
  process.env[`ACC_${role.toUpperCase()}_PASSWORD`] ||
  randomBytes(12).toString('base64url');

const accounts = {};
for (const role of ['student', 'counsellor', 'admin']) {
  const cfg = defaults[role];
  const email = process.env[`ACC_${role.toUpperCase()}_EMAIL`] || cfg.email;
  const password = passwordFor(role);
  let existing = await findUserByEmail(email);
  if (!existing) {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: cfg.name, ...(cfg.phone ? { phone: cfg.phone } : {}) },
    });
    if (error) throw error;
    existing = data.user;
  }
  const { error: setRole } = await client
    .from('users')
    .update({ role, ...(cfg.phone ? { phone: cfg.phone } : {}) })
    .eq('email', email);
  if (setRole) {
    if (!cfg.phone) throw setRole;
    // The phone column needs 002_phone_resources.sql; role assignment must still work.
    const { error: roleOnly } = await client.from('users').update({ role }).eq('email', email);
    if (roleOnly) throw roleOnly;
    console.warn('Phone not saved. Run supabase/migrations/002_phone_resources.sql.');
  }
  const { data: row } = await client
    .from('users')
    .select('id,email,role')
    .eq('email', email)
    .maybeSingle();
  if (!row) throw new Error(`public.users row missing for ${email}`);
  accounts[role] = { id: existing.id, email, password, role: row.role };
  console.log(
    `${role.padEnd(9)} ${email}  role=${row.role}  password=${password}`,
  );
}
const out = {
  created_at: new Date().toISOString(),
  note: 'Test accounts for role verification. git-ignored; rotate or delete after testing.',
  accounts,
};
await mkdir(resolve('data'), { recursive: true });
await writeFile(resolve('data/accounts.json'), JSON.stringify(out, null, 2), {
  mode: 0o600,
});
console.log('Credentials saved to data/accounts.json');