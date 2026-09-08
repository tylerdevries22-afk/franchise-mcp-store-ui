// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpStore, type McpStoreEntry } from './index.js';

afterEach(cleanup);
const entry: McpStoreEntry = { id: 'slack', name: 'Slack', description: 'Messaging',
  type: 'Work', status: 'not_connected', popular: true, connectHref: '/connect/slack' };

describe('store interaction boundaries', () => {
  it.each(['javascript:alert(1)', '/\\evil.example', '//evil.example', 'https://user:secret@example.com'])(
  'does not render unsafe links %s', (href) => {
    const { container } = render(<McpStore entries={[{ ...entry, connectHref: href, detailHref: href,
      setup: { kind: 'api-key', estimatedMinutes: 1, steps: [{ text: 'Step', href }], consoleHref: href } }]} />);
    expect(container.querySelector('a')).toBeNull();
  });
  it('isolates IDs between instances', () => {
    const { container } = render(<><McpStore entries={[entry]} /><McpStore entries={[entry]} /></>);
    const ids = Array.from(container.querySelectorAll('[id]')).map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('supports keyboard tabs with one tab stop and matching panel labels', () => {
    render(<McpStore entries={[entry]} />);
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tabs[1].id);
    fireEvent.keyDown(tabs[1], { key: 'End' });
    expect(tabs[2]).toHaveFocus();
    fireEvent.keyDown(tabs[2], { key: 'Home' });
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    expect(tabs[2]).toHaveFocus();
    fireEvent.keyDown(tabs[2], { key: 'Tab' });
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
  });
  it('filters popular results together with the directory and handles empty searches', () => {
    render(<McpStore entries={[entry]} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Unknown' } });
    expect(screen.queryByText('Slack')).toBeNull();
    expect(screen.getByText('No connectors match this view.')).toBeInTheDocument();
  });
  it('emits deduplicated selection changes and supports deselection', () => {
    const changed = vi.fn();
    const { rerender } = render(<McpStore entries={[entry]} mode="select" onSelectionChange={changed} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Slack/ })[0]);
    expect(changed).toHaveBeenLastCalledWith(['slack']);
    rerender(<McpStore entries={[entry]} mode="select" selectedIds={['slack']} onSelectionChange={changed} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Slack/ })[0]);
    expect(changed).toHaveBeenLastCalledWith([]);
  });
  it.each(['connected', 'unavailable', 'reconnect', 'manual'] as const)('renders %s honestly', (status) => {
    render(<McpStore entries={[{ ...entry, status, accountName: 'Account', readiness: 'Review access', detailHref: '/detail' }]}
      outcome="error" renderIcon={() => <i>Logo</i>} />);
    expect(screen.getByRole('status')).toHaveTextContent('could not be completed');
    expect(screen.getByText('Account')).toBeInTheDocument();
  });
});
