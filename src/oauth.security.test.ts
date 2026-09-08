import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createMcpOAuthMaterial, mcpCookieBindingMatches, mcpOAuthCookieName,
  mcpSha256, McpStoreError, verifyMcpOAuthState,
} from './oauth.js';

const SECRET = 'unit-test-only-state-key-with-at-least-32-characters';
const NOW = 1_000_000;
const material = createMcpOAuthMaterial('slack', SECRET, NOW);
function signed(changes: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify({ provider: 'slack', nonce: material.nonce,
    issuedAt: NOW, expiresAt: NOW + 60_000, ...changes })).toString('base64url');
  return `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
}

describe('OAuth adversarial inputs', () => {
  it.each([null, undefined, 0, {}, [], '', 'a', 'x'.repeat(2049)])('fails closed for malformed state %#', (value) => {
    expect(verifyMcpOAuthState(value, 'slack', SECRET, NOW)).toBeNull();
  });
  it.each(['.', '..', '.extra', '=', '\n', ' '])('rejects noncanonical framing %j', (suffix) => {
    expect(verifyMcpOAuthState(material.state + suffix, 'slack', SECRET, NOW)).toBeNull();
  });
  it.each([
    { issuedAt: -1 }, { issuedAt: NOW + 1 }, { issuedAt: 1.2 }, { expiresAt: NOW },
    { expiresAt: NOW - 1 }, { expiresAt: NOW + 59_999 }, { expiresAt: NOW + 1_800_001 },
    { expiresAt: 'later' }, { provider: '../slack' }, { nonce: 'short' },
  ])('rejects signed but invalid claims %#', (claims) => {
    expect(verifyMcpOAuthState(signed(claims), 'slack', SECRET, NOW)).toBeNull();
  });
  it('accepts exact valid lifetime boundaries and expires at the boundary', () => {
    for (const ttl of [60_000, 1_800_000]) {
      const state = createMcpOAuthMaterial('slack', SECRET, NOW, ttl).state;
      expect(verifyMcpOAuthState(state, 'slack', SECRET, NOW)).not.toBeNull();
      expect(verifyMcpOAuthState(state, 'slack', SECRET, NOW + ttl)).toBeNull();
    }
  });
  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER])('rejects an invalid clock %s', (now) => {
    expect(() => createMcpOAuthMaterial('slack', SECRET, now)).toThrow(McpStoreError);
    expect(verifyMcpOAuthState(material.state, 'slack', SECRET, now)).toBeNull();
  });
  it.each([0, 59_999, 1_800_001, NaN, 60_000.5])('rejects an invalid TTL %s', (ttl) => {
    expect(() => createMcpOAuthMaterial('slack', SECRET, NOW, ttl)).toThrow(McpStoreError);
  });
  it('rejects a wrong key, provider or invalid verification configuration', () => {
    expect(verifyMcpOAuthState(material.state, 'slack', SECRET + 'other', NOW)).toBeNull();
    expect(verifyMcpOAuthState(material.state, '../slack', SECRET, NOW)).toBeNull();
    expect(verifyMcpOAuthState(material.state, 'slack', null, NOW)).toBeNull();
    expect(verifyMcpOAuthState(material.state, 'slack', 'short', NOW)).toBeNull();
  });
  it('validates prefix boundaries and produces safe cookie names', () => {
    expect(mcpOAuthCookieName('slack')).toBe('mcp_oauth_slack');
    expect(mcpOAuthCookieName('google-suite', '__Host-mcp')).toBe('__Host-mcp_google-suite');
    for (const prefix of ['', 'bad; Secure', 'bad\r\nX-Header', 'a'.repeat(65)]) {
      expect(() => mcpOAuthCookieName('slack', prefix)).toThrow(/prefix/);
    }
    expect(() => mcpOAuthCookieName('../slack')).toThrow(/provider/);
  });
  it('creates unique high-entropy material with the RFC 7636 S256 challenge', () => {
    const next = createMcpOAuthMaterial('slack', SECRET, NOW);
    expect(next.nonce).not.toBe(material.nonce);
    expect(next.cookieBinding).not.toBe(material.cookieBinding);
    expect(next.codeVerifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(next.codeChallenge).toBe(createHash('sha256').update(next.codeVerifier).digest('base64url'));
    expect(mcpSha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('rejects malformed cookie bindings without throwing or leaking input', () => {
    for (const value of [null, {}, '', 'a'.repeat(101)]) {
      expect(mcpCookieBindingMatches(value, material.cookieBindingSha256)).toBe(false);
    }
    for (const digest of [null, '', material.cookieBindingSha256.toUpperCase(), 'f'.repeat(64)]) {
      expect(mcpCookieBindingMatches(material.cookieBinding, digest)).toBe(false);
    }
    expect(mcpCookieBindingMatches(material.cookieBinding, material.cookieBindingSha256)).toBe(true);
    const error = new McpStoreError('invalid_input', 'Invalid input.');
    expect(error.code).toBe('invalid_input');
    expect(error.name).toBe('McpStoreError');
  });
});
