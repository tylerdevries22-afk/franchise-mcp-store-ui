import { describe, expect, it } from 'vitest';
import { safeHref } from './links.js';

describe('navigation boundary', () => {
  it.each([null, undefined, {}, '', '//evil.example', '/\\evil.example', '/\n/evil.example',
    'javascript:alert(1)', 'data:text/html,bad', 'http://example.com', 'https://',
    'https://user:pass@example.com', 'https://example.com/white space', '/x\u007f', 'x'.repeat(2049)])(
    'rejects unsafe or malformed navigation %#', (value) => expect(safeHref(value)).toBeNull(),
  );
  it.each(['/', '/connect/slack?intent=connect', '/docs#setup'])('allows local navigation %s', (href) => {
    expect(safeHref(href)).toEqual({ href, external: false });
  });
  it('allows valid HTTPS documentation', () => {
    expect(safeHref('https://example.com/docs')).toEqual({ href: 'https://example.com/docs', external: true });
  });
});
