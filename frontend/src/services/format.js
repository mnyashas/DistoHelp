export const fmt = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const initials = (name) =>
  name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

export function downloadCSV(filename, rows) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}