export const PROVIDER = /^[a-z][a-z0-9_-]{1,62}$/;
export const TOKEN = /^[A-Za-z0-9_-]{32,100}$/;
export const MIN_TTL = 60_000;
export const MAX_TTL = 30 * 60_000;

export function validProvider(value: unknown): value is string {
  return typeof value === 'string' && PROVIDER.test(value);
}

export function validSecret(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 32 && value.length <= 4096;
}

export function validClock(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    && value <= Number.MAX_SAFE_INTEGER - MAX_TTL;
}
