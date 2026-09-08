'use client';

import styles from './styles.module.css';

const FILTERS = ['all', 'connected', 'not_connected'] as const;
type Filter = typeof FILTERS[number];

export function StoreFilters({ id, filter, labels, onChange }: {
  id: string; filter: Filter; labels: readonly string[]; onChange: (value: Filter) => void;
}) {
  return <div className={styles.tabs} role="tablist" aria-label="Connector status">
    {FILTERS.map((value, index) => <button key={value} type="button" id={`${id}-${value}`}
      role="tab" aria-controls={`${id}-directory`} tabIndex={filter === value ? 0 : -1}
      aria-selected={filter === value} onClick={() => onChange(value)} onKeyDown={(event) => {
        const offsets: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: 2 - index };
        if (!(event.key in offsets)) return;
        event.preventDefault();
        const next = (index + offsets[event.key] + FILTERS.length) % FILTERS.length;
        onChange(FILTERS[next]);
        event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus();
      }}>{labels[index]}</button>)}
  </div>;
}
