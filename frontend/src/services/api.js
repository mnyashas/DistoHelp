const BASE = '/api';

export const getToken = () => localStorage.getItem('spm_token');
export const setToken = (token) =>
  token ? localStorage.setItem('spm_token', token) : localStorage.removeItem('spm_token');

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('spm:logout'));
  }
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}