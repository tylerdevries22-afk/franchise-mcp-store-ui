import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { McpStore, type McpStoreEntry } from './index';

const ENTRIES: readonly McpStoreEntry[] = [{
  id: 'slack', name: 'Slack', description: 'Team messages', type: 'Web',
  status: 'not_connected', popular: true, connectHref: '/connect/slack',
}];

describe('McpStore', () => {
  it('renders the shared StillPoint directory structure', () => {
    const html = renderToStaticMarkup(<McpStore entries={ENTRIES} />);
    expect(html).toContain('Popular');
    expect(html).toContain('Connector');
    expect(html).toContain('Connect');
  });

  it('renders tenant selection controls without navigation', () => {
    const html = renderToStaticMarkup(<McpStore entries={ENTRIES} mode="select" selectedIds={['slack']} />);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Included');
    expect(html).not.toContain('href=');
  });
});
