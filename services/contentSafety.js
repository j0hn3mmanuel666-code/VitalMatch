export function safeContentUrl(value, { image = false } = {}) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 2000 || /[\u0000-\u0020\\]/.test(value)) throw new Error('Invalid content URL');
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (!image && /^#[a-z0-9_-]+$/i.test(value)) return value;
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Use a local path or HTTPS URL');
  return parsed.href;
}
