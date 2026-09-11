import type { McpStoreSetupKind } from './setup.js';

export type FranchiseAvailabilityDefault = 'available' | 'coming-soon';

export type FranchiseProviderDescriptor = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly setupKind: McpStoreSetupKind;
  readonly estimatedMinutes: number;
  readonly steps: readonly { readonly text: string; readonly href?: string }[];
  readonly consoleHref?: string;
  readonly documentationHref?: string;
  readonly availabilityDefault: FranchiseAvailabilityDefault;
};

/** Canonical franchise provider descriptors (CS/Elevate kebab ids). Display-only — no secrets, no connectHref. */
export const FRANCHISE_PROVIDER_CATALOG: readonly FranchiseProviderDescriptor[] = Object.freeze([
  {
    id: 'google-suite',
    name: 'Google',
    type: 'Marketing',
    description: 'Business Profile, Gmail, Drive, Calendar, Analytics, and Ads.',
    setupKind: 'one-click-oauth',
    estimatedMinutes: 2,
    consoleHref: 'https://console.cloud.google.com/apis/credentials',
    documentationHref: 'https://developers.google.com/identity/protocols/oauth2/web-server',
    steps: [
      { text: 'You are granting Drive, Calendar and Gmail compose access for this organization.' },
    ],
    availabilityDefault: 'available',
  },
  {
    id: 'slack',
    name: 'Slack',
    type: 'Communications',
    description: 'Selected-channel alerts, daily summaries, tests, and revocation.',
    setupKind: 'one-click-oauth',
    estimatedMinutes: 2,
    consoleHref: 'https://api.slack.com/apps',
    documentationHref: 'https://api.slack.com/authentication/oauth-v2',
    steps: [{ text: 'Pick the single channel that should receive alerts.' }],
    availabilityDefault: 'available',
  },
  {
    id: 'twilio',
    name: 'Twilio',
    type: 'Communications',
    description: 'Verified SMS senders, delivery status, quotas, and webhook reconciliation.',
    setupKind: 'api-key',
    estimatedMinutes: 4,
    consoleHref: 'https://console.twilio.com/us1/account/keys-credentials/api-keys',
    documentationHref: 'https://www.twilio.com/docs/messaging',
    steps: [
      {
        text: 'Open Twilio Console, then Account, then API keys and tokens.',
        href: 'https://console.twilio.com/us1/account/keys-credentials/api-keys',
      },
      { text: 'Create a standard API key and copy the SID and secret.' },
    ],
    availabilityDefault: 'available',
  },
  {
    id: 'resend',
    name: 'Resend',
    type: 'Communications',
    description: 'Transactional email, sender health, delivery events, and suppressions.',
    setupKind: 'api-key',
    estimatedMinutes: 3,
    consoleHref: 'https://resend.com/api-keys',
    documentationHref: 'https://resend.com/docs/api-reference/introduction',
    steps: [
      { text: 'Open Resend, then API Keys, then Create API Key.', href: 'https://resend.com/api-keys' },
      { text: 'Give it Sending access, then copy the key that starts with re_.' },
    ],
    availabilityDefault: 'available',
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    type: 'Communications',
    description: 'Transactional email and delivery webhooks.',
    setupKind: 'api-key',
    estimatedMinutes: 3,
    consoleHref: 'https://app.sendgrid.com/settings/api_keys',
    documentationHref: 'https://www.twilio.com/docs/sendgrid',
    steps: [{ text: 'Create a SendGrid API key with mail send permission.' }],
    availabilityDefault: 'available',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    type: 'Finance',
    description: 'Payments, customer portal, and invoicing.',
    setupKind: 'one-click-oauth',
    estimatedMinutes: 2,
    consoleHref: 'https://dashboard.stripe.com/apikeys',
    documentationHref: 'https://docs.stripe.com/connect',
    steps: [{ text: 'Connect a Stripe account for this organization.' }],
    availabilityDefault: 'available',
  },
  {
    id: 'transistor',
    name: 'Transistor',
    type: 'Marketing',
    description: 'Podcast analytics and episode publishing.',
    setupKind: 'api-key',
    estimatedMinutes: 3,
    consoleHref: 'https://dashboard.transistor.fm/account',
    documentationHref: 'https://developers.transistor.fm/',
    steps: [{ text: 'Copy your Transistor API key from the account page.' }],
    availabilityDefault: 'available',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    type: 'Marketing',
    description: 'Channel analytics and upload status.',
    setupKind: 'one-click-oauth',
    estimatedMinutes: 2,
    consoleHref: 'https://console.cloud.google.com/apis/credentials',
    documentationHref: 'https://developers.google.com/youtube/v3',
    steps: [{ text: 'Authorize the YouTube Data API for this channel.' }],
    availabilityDefault: 'available',
  },
  {
    id: 'meta-business-suite',
    name: 'Meta Business Suite',
    type: 'Marketing',
    description: 'Page insights and scheduled posts after app review.',
    setupKind: 'one-click-oauth',
    estimatedMinutes: 2,
    consoleHref: 'https://developers.facebook.com/apps/',
    documentationHref: 'https://developers.facebook.com/docs/graph-api',
    steps: [{ text: 'Connect a Meta Business account after app review.' }],
    availabilityDefault: 'available',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    type: 'Marketing',
    description: 'Account insights. Publishing waits on app review.',
    setupKind: 'one-click-oauth',
    estimatedMinutes: 2,
    consoleHref: 'https://developers.tiktok.com/',
    documentationHref: 'https://developers.tiktok.com/doc/login-kit-web',
    steps: [{ text: 'Authorize TikTok Login Kit for this account.' }],
    availabilityDefault: 'available',
  },
  {
    id: 'square',
    name: 'Square',
    type: 'Commerce',
    description: 'Catalog, orders, and location reporting.',
    setupKind: 'one-click-oauth',
    estimatedMinutes: 2,
    consoleHref: 'https://developer.squareup.com/apps',
    documentationHref: 'https://developer.squareup.com/docs',
    steps: [{ text: 'Connect the Square application for this location.' }],
    availabilityDefault: 'available',
  },
  // Planned / coming-soon (metadata only; hosts keep demote-unwired until certified)
  ...([
    ['shopify', 'Shopify', 'Platform'],
    ['github', 'GitHub', 'Platform'],
    ['supabase', 'Supabase', 'Platform'],
    ['vercel', 'Vercel', 'Platform'],
    ['sentry', 'Sentry', 'Platform'],
    ['plaid', 'Plaid', 'Finance'],
    ['quickbooks-online', 'QuickBooks Online', 'Finance'],
    ['beehiiv', 'beehiiv', 'Marketing'],
    ['kindle-direct-publishing', 'Kindle Direct Publishing', 'Marketing'],
    ['acx-audiobooks', 'ACX Audiobooks', 'Marketing'],
    ['cloudflare', 'Cloudflare', 'Platform'],
    ['expo', 'Expo', 'Platform'],
    ['apple-distribution', 'Apple Distribution', 'Platform'],
    ['google-play', 'Google Play', 'Platform'],
    ['checkly', 'Checkly', 'Platform'],
    ['turnstile', 'Turnstile', 'Platform'],
  ] as const).map(([id, name, type]) => ({
    id,
    name,
    type,
    description: 'Planned integration. Provider certification is not yet available.',
    setupKind: 'operator-portal' as const,
    estimatedMinutes: 0,
    steps: [] as const,
    availabilityDefault: 'coming-soon' as const,
  })),
]);
