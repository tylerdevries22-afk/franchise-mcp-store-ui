import { describe, expect, it } from 'vitest';

import {
  FRANCHISE_PROVIDER_CATALOG,
  getFranchiseProvider,
  listFranchiseProviderIds,
  projectFranchiseCatalog,
} from './catalog.js';

/** Frozen baseline — update deliberately when registering a new franchise provider. */
const STABLE_IDS = [
  'acx-audiobooks',
  'apple-distribution',
  'beehiiv',
  'checkly',
  'cloudflare',
  'expo',
  'github',
  'google-play',
  'google-suite',
  'kindle-direct-publishing',
  'meta-business-suite',
  'plaid',
  'quickbooks-online',
  'resend',
  'sendgrid',
  'sentry',
  'shopify',
  'slack',
  'square',
  'stripe',
  'supabase',
  'tiktok',
  'transistor',
  'turnstile',
  'twilio',
  'vercel',
  'youtube',
] as const;

describe('franchise provider catalog', () => {
  it('keeps canonical ids unique and stable', () => {
    const ids = FRANCHISE_PROVIDER_CATALOG.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(listFranchiseProviderIds()).toEqual([...STABLE_IDS]);
  });

  it('only uses known setup kinds', () => {
    const kinds = new Set(FRANCHISE_PROVIDER_CATALOG.map((row) => row.setupKind));
    expect([...kinds].sort()).toEqual(['api-key', 'one-click-oauth', 'operator-portal']);
  });

  it('never embeds secrets or connect routes in descriptors', () => {
    const blob = JSON.stringify(FRANCHISE_PROVIDER_CATALOG);
    expect(blob).not.toMatch(/connectHref|client_secret|CLIENT_SECRET|password|Bearer |sk_live|re_[A-Za-z0-9]/);
    for (const row of FRANCHISE_PROVIDER_CATALOG) {
      expect(row).not.toHaveProperty('connectHref');
      expect(Object.keys(row).sort()).toEqual(
        expect.arrayContaining([
          'id', 'name', 'type', 'description', 'setupKind',
          'estimatedMinutes', 'steps', 'availabilityDefault',
        ]),
      );
    }
  });

  it('demotes unwired providers (Elevate #41 overlay pattern)', () => {
    const entries = projectFranchiseCatalog({
      overlay: {
        connectable: new Set(['google-suite']),
        connectHref: (id) => `/api/integrations/${id}/start`,
      },
    });
    const google = entries.find((row) => row.id === 'google-suite');
    const slack = entries.find((row) => row.id === 'slack');
    expect(google?.status).toBe('not_connected');
    expect(google?.connectHref).toBe('/api/integrations/google-suite/start');
    expect(slack?.status).toBe('unavailable');
    expect(slack?.connectHref).toBeNull();
    expect(getFranchiseProvider('google-suite')?.name).toBe('Google');
  });

  it('lets installation status win while keeping non-connectable hrefs null', () => {
    const entries = projectFranchiseCatalog({
      overlay: {
        connectable: ['google-suite'],
        connectHref: (id) => `/api/integrations/${id}/start`,
      },
      installations: [
        { provider: 'slack', status: 'connected', accountName: 'ops' },
      ],
    });
    const slack = entries.find((row) => row.id === 'slack');
    expect(slack?.status).toBe('connected');
    expect(slack?.accountName).toBe('ops');
    expect(slack?.connectHref).toBeNull();
  });

  it('marks coming-soon rows unavailable even if mistakenly listed connectable without href', () => {
    const entries = projectFranchiseCatalog({
      overlay: {
        connectable: ['shopify'],
        connectHref: () => null,
      },
    });
    const shopify = entries.find((row) => row.id === 'shopify');
    expect(shopify?.status).toBe('unavailable');
    expect(shopify?.connectHref).toBeNull();
  });


  it('supports include filter and hostExclusive extras', () => {
    const entries = projectFranchiseCatalog({
      overlay: {
        include: ['google-suite', 'jobtread'],
        connectable: ['google-suite'],
        connectHref: (id) => `/start/${id}`,
        hostExclusive: [{
          id: 'jobtread',
          name: 'JobTread',
          description: 'Host-only',
          type: 'Operations',
          status: 'not_connected',
          connectHref: '/api/finance/connect/jobtread',
        }],
      },
    });
    expect(entries.map((row) => row.id).sort()).toEqual(['google-suite', 'jobtread']);
  });

  it('aliases map host installation keys onto canonical rows', () => {
    const entries = projectFranchiseCatalog({
      overlay: {
        aliases: { gmail: 'google-suite' },
        connectable: ['google-suite'],
        connectHref: (id) => `/start/${id}`,
      },
      installations: [
        { provider: 'gmail', status: 'connected', accountName: 'ops@example.com' },
      ],
    });
    const google = entries.find((row) => row.id === 'google-suite');
    expect(google?.status).toBe('connected');
    expect(google?.accountName).toBe('ops@example.com');
  });

});
