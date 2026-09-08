/** UI navigation only. Server-side fetches need their own SSRF/egress policy. */
export function safeHref(value: unknown): { href: string; external: boolean } | null {
  if (typeof value !== 'string' || value.length > 2048
    || /[\s\\]/u.test(value) || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
  if (value.startsWith('/') && !value.startsWith('//')) {
    return { href: value, external: false };
  }
  if (!value.startsWith('https://')) return null;
  try {
    const url = new URL(value);
    if (!url.hostname || url.username || url.password) return null;
    return { href: value, external: true };
  } catch { return null; }
}
