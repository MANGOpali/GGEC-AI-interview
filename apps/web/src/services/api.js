import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const authClient = url ? createClient(url, import.meta.env.VITE_SUPABASE_ANON_KEY) : null;
let demoId = sessionStorage.getItem('ggec-demo-user') || '10000000-0000-4000-8000-000000000001';
export const auth = {
  async signIn(email, password) {
    if (!authClient) throw new Error('Supabase browser settings are missing.');
    const { error } = await authClient.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  },
  async signUp(email, password, name, phone) {
    if (!authClient) throw new Error('Supabase browser settings are missing.');
    const { data, error } = await authClient.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim(), phone: phone.trim() } },
    });
    if (error) throw error;
    return data;
  },
  async changePassword(email, currentPassword, newPassword) {
    if (!authClient) throw new Error('Supabase browser settings are missing.');
    const { error: verify } = await authClient.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (verify) throw new Error('Current password is incorrect.');
    const { error } = await authClient.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },
  async signOut() {
    if (authClient) await authClient.auth.signOut();
  },
  setDemo(id) {
    demoId = id;
    sessionStorage.setItem('ggec-demo-user', id);
  },
};
let mode = null;
let speechProvider = 'browser';
export const getSpeechProvider = () => speechProvider;
export async function health() {
  const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/health`);
  if (!res.ok) throw new Error('API unavailable');
  const h = await res.json();
  mode = h.mode;
  speechProvider = h.stt || 'browser';
  return h;
}
export async function api(path, method = 'GET', body, options = {}) {
  const binary = body instanceof Blob;
  const headers = {
    'Content-Type': binary ? body.type : 'application/json',
    ...(binary ? { 'X-Audio-Consent': 'groq-v1' } : {}),
  };
  if (mode === 'demo') headers['X-Demo-User'] = demoId;
  else if (authClient) {
    const { data } = await authClient.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api${path}`, {
    method,
    headers,
    signal: options.signal,
    ...(body !== undefined ? { body: binary ? body : JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    let message = 'Request failed';
    try {
      message = (await response.json()).error || message;
    } catch {}
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return response.status === 204 ? null : response.json();
}
