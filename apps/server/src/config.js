import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createVault } from './crypto.js';
import { localRepository, supabaseRepository } from './repository.js';
export async function configure(env = process.env) {
  const mode = env.APP_MODE || 'demo';
  if (!['demo', 'supabase'].includes(mode)) throw new Error('Unknown APP_MODE');
  if (mode === 'demo' && env.NODE_ENV === 'production')
    throw new Error('Demo mode cannot run in production.');
  let key = env.DATA_ENCRYPTION_KEY;
  if (mode === 'demo' && !key) {
    const path = resolve('data/demo.key');
    await mkdir(resolve('data'), { recursive: true });
    try {
      key = await readFile(path, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      key = randomBytes(32).toString('base64');
      await writeFile(path, key, { mode: 0o600, flag: 'wx' });
    }
  }
  if (!key) throw new Error('DATA_ENCRYPTION_KEY is required.');
  const vault = createVault(key);
  if (mode === 'supabase' && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY))
    throw new Error('Supabase server credentials required.');
  const repo =
    mode === 'demo'
      ? await localRepository(resolve('data/demo.json'), vault)
      : supabaseRepository(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, vault);
  const authenticate = async (req) => {
    if (mode === 'demo') return (await repo.get('users', req.get('X-Demo-User'))) || null;
    const token = req.get('Authorization')?.replace(/^Bearer /, '');
    if (!token) return null;
    const { data, error } = await repo.client.auth.getUser(token);
    if (error || !data.user) return null;
    return repo.get('users', data.user.id);
  };
  return { repo, authenticate };
}
