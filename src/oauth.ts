import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { McpStoreError } from './errors.js';
import { MAX_TTL, MIN_TTL, TOKEN, validClock, validProvider, validSecret } from './oauth-validation.js';

export { McpStoreError } from './errors.js';

export type McpOAuthMaterial = {
  readonly nonce: string;
  readonly nonceSha256: string;
  readonly cookieBinding: string;
  readonly cookieBindingSha256: string;
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly state: string;
};

export type McpOAuthState = {
  readonly provider: string;
  readonly nonce: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
};

export function mcpSha256(value: string): string {
  if (typeof value !== 'string') throw new McpStoreError('invalid_input', 'Expected text to hash.');
  return createHash('sha256').update(value).digest('hex');
}

export function mcpOAuthCookieName(provider: string, prefix = 'mcp_oauth'): string {
  if (!validProvider(provider)) throw new McpStoreError('invalid_input', 'Invalid connector provider key.');
  if (typeof prefix !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(prefix)) {
    throw new McpStoreError('invalid_input', 'Invalid connector cookie prefix.');
  }
  return `${prefix}_${provider}`;
}

export function createMcpOAuthMaterial(
  provider: string,
  secret: string,
  nowMs = Date.now(),
  ttlMs = 10 * 60_000,
): McpOAuthMaterial {
  if (!validProvider(provider)) throw new McpStoreError('invalid_input', 'Invalid connector provider key.');
  if (!validSecret(secret)) throw new McpStoreError('invalid_configuration', 'Connector OAuth state secret is not configured.');
  if (!validClock(nowMs) || !Number.isSafeInteger(ttlMs) || ttlMs < MIN_TTL || ttlMs > MAX_TTL) {
    throw new McpStoreError('invalid_input', 'Connector OAuth state lifetime is invalid.');
  }
  const nonce = randomBytes(32).toString('base64url');
  const cookieBinding = randomBytes(32).toString('base64url');
  const codeVerifier = randomBytes(48).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const payload = Buffer.from(JSON.stringify({
    provider, nonce, issuedAt: nowMs, expiresAt: nowMs + ttlMs,
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return {
    nonce, nonceSha256: mcpSha256(nonce), cookieBinding,
    cookieBindingSha256: mcpSha256(cookieBinding), codeVerifier,
    codeChallenge, state: `${payload}.${signature}`,
  };
}

function stateOf(value: unknown): McpOAuthState | null {
  if (!value || typeof value !== 'object') return null;
  const provider = Reflect.get(value, 'provider');
  const nonce = Reflect.get(value, 'nonce');
  const issuedAt = Reflect.get(value, 'issuedAt');
  const expiresAt = Reflect.get(value, 'expiresAt');
  if (!validProvider(provider)
    || typeof nonce !== 'string' || !TOKEN.test(nonce)
    || typeof issuedAt !== 'number' || !Number.isSafeInteger(issuedAt)
    || typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt)
    || !validClock(issuedAt) || expiresAt - issuedAt < MIN_TTL
    || expiresAt - issuedAt > MAX_TTL) return null;
  return { provider, nonce, issuedAt, expiresAt };
}

export function verifyMcpOAuthState(
  state: unknown,
  expectedProvider: unknown,
  secret: unknown,
  nowMs = Date.now(),
): McpOAuthState | null {
  if (typeof state !== 'string' || state.length > 2048 || !validProvider(expectedProvider)
    || !validSecret(secret) || !validClock(nowMs)) return null;
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (supplied.toString('base64url') !== signature) return null;
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const decoded = Buffer.from(payload, 'base64url');
    if (decoded.toString('base64url') !== payload) return null;
    const parsed = stateOf(JSON.parse(decoded.toString('utf8')));
    if (!parsed || parsed.provider !== expectedProvider || parsed.issuedAt > nowMs
      || parsed.expiresAt <= nowMs) return null;
    return parsed;
  } catch { return null; }
}

export function mcpCookieBindingMatches(value: unknown, expectedSha256: unknown): boolean {
  if (typeof value !== 'string' || !TOKEN.test(value)
    || typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256)) return false;
  const actual = Buffer.from(mcpSha256(value));
  const expected = Buffer.from(expectedSha256);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
