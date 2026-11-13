// Dev: same-origin /api (vite proxy -> localhost:8000)
// Prod build for Cloudflare Pages: set VITE_API_URL to the backend's public URL
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

export const getToken = () => localStorage.getItem('spm_token');
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';
export const setToken = (token) =>
  token ? localStorage.setItem('spm_token', token) : localStorage.removeItem('spm_token');

// Download an authenticated file (e.g. patient PDF) from the API.
export async function downloadFile(path, filename) {
  const token = getToken();
  const res = await fetch(API_BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  a.click();
  URL.revokeObjectURL(url);
}

export async function api(path, { method = 'GET', body, headers: extraHeaders } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (extraHeaders) Object.assign(headers, extraHeaders);

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