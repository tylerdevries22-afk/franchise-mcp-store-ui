/**
 * Shared franchise provider registry + host overlay projection.
 *
 * Descriptors are display/setup metadata only (DESIGN.md model 2). Hosts supply
 * connectability, connectHref, aliases, and tenant mapping. Adding a row here
 * must NOT enable Connect on any host (Elevate demote-unwired / #41).
 */
import type { McpStoreEntry, McpStoreStatus } from './index.js';
import type { McpStoreSetup } from './setup.js';
import {
  FRANCHISE_PROVIDER_CATALOG,
  type FranchiseProviderDescriptor,
} from './catalog-data.js';

export {
  FRANCHISE_PROVIDER_CATALOG,
  type FranchiseAvailabilityDefault,
  type FranchiseProviderDescriptor,
} from './catalog-data.js';

export type FranchiseInstallationSnapshot = {
  readonly provider: string;
  readonly status: McpStoreStatus;
  readonly accountName?: string | null;
};

/**
 * Per-host overlay. Connectability is certification-gated (Elevate
 * CONNECTABLE_PROVIDER_IDS). Shared catalog never invents connectHref.
 */
export type HostCatalogOverlay = {
  /** Canonical ids that may show Connect. Default: none. */
  readonly connectable?: ReadonlySet<string> | readonly string[];
  /** Build start href for a certified id; return null to demote. */
  readonly connectHref?: (id: string) => string | null | undefined;
  /** Optional connect button label override. */
  readonly connectLabel?: (id: string) => string | undefined;
  /** Host key → canonical catalog id (Stillpoint aliases). */
  readonly aliases?: Readonly<Record<string, string>>;
  /** Subset filter; omit to include all descriptors (+ hostExclusive). */
  readonly include?: readonly string[];
  /** Extra host-only rows appended after the shared list. */
  readonly hostExclusive?: readonly McpStoreEntry[];
  /** Copy overrides keyed by canonical id. */
  readonly overrides?: Readonly<Record<string, Partial<Pick<
    McpStoreEntry, 'name' | 'description' | 'type' | 'popular' | 'detailHref' | 'readiness'
  >>>>;
};

function asConnectableSet(overlay: HostCatalogOverlay): ReadonlySet<string> {
  const raw = overlay.connectable;
  if (!raw) return new Set();
  return raw instanceof Set ? raw : new Set(raw);
}

function setupFrom(descriptor: FranchiseProviderDescriptor): McpStoreSetup | undefined {
  if (descriptor.steps.length === 0 && descriptor.availabilityDefault === 'coming-soon') {
    return undefined;
  }
  return {
    kind: descriptor.setupKind,
    estimatedMinutes: descriptor.estimatedMinutes,
    steps: descriptor.steps,
    consoleHref: descriptor.consoleHref ?? null,
    documentationHref: descriptor.documentationHref ?? null,
  };
}

function resolveCanonicalId(id: string, aliases?: Readonly<Record<string, string>>): string {
  return aliases?.[id] ?? id;
}

export type ProjectFranchiseCatalogOptions = {
  readonly descriptors?: readonly FranchiseProviderDescriptor[];
  readonly overlay: HostCatalogOverlay;
  readonly installations?: readonly FranchiseInstallationSnapshot[];
};

/**
 * Project shared descriptors through a host overlay into McpStoreEntry[].
 * Non-connectable ids without an installation become unavailable with null connectHref.
 */
export function projectFranchiseCatalog(options: ProjectFranchiseCatalogOptions): McpStoreEntry[] {
  const descriptors = options.descriptors ?? FRANCHISE_PROVIDER_CATALOG;
  const { overlay, installations = [] } = options;
  const connectable = asConnectableSet(overlay);
  const byProvider = new Map<string, FranchiseInstallationSnapshot>();
  for (const row of installations) {
    const canonical = resolveCanonicalId(row.provider, overlay.aliases);
    // First matching install wins; prefer an already-canonical provider key.
    if (!byProvider.has(canonical) || row.provider === canonical) {
      byProvider.set(canonical, row);
    }
  }
  const include = overlay.include ? new Set(overlay.include) : null;

  const entries: McpStoreEntry[] = [];
  for (const descriptor of descriptors) {
    if (include && !include.has(descriptor.id)) continue;
    const installation = byProvider.get(descriptor.id);
    const certified = connectable.has(descriptor.id);
    const override = overlay.overrides?.[descriptor.id];
    let status: McpStoreStatus;
    let connectHref: string | null | undefined;
    if (installation) {
      status = installation.status;
      connectHref = certified ? overlay.connectHref?.(descriptor.id) ?? null : null;
    } else if (descriptor.availabilityDefault === 'coming-soon') {
      status = 'unavailable';
      connectHref = null;
    } else if (certified) {
      const href = overlay.connectHref?.(descriptor.id) ?? null;
      if (href) {
        status = 'not_connected';
        connectHref = href;
      } else {
        status = 'unavailable';
        connectHref = null;
      }
    } else {
      // Elevate #41 demote-unwired: show card, no Connect.
      status = 'unavailable';
      connectHref = null;
    }

    entries.push({
      id: descriptor.id,
      name: override?.name ?? descriptor.name,
      description: override?.description ?? descriptor.description,
      type: override?.type ?? descriptor.type,
      status,
      accountName: installation?.accountName ?? null,
      readiness: override?.readiness,
      popular: override?.popular,
      detailHref: override?.detailHref,
      connectHref: connectHref ?? null,
      connectLabel: overlay.connectLabel?.(descriptor.id),
      setup: setupFrom(descriptor),
      selectable: status !== 'unavailable',
    });
  }

  if (overlay.hostExclusive?.length) {
    for (const extra of overlay.hostExclusive) {
      const canonical = resolveCanonicalId(extra.id, overlay.aliases);
      if (include && !include.has(canonical) && !include.has(extra.id)) continue;
      entries.push(extra);
    }
  }

  return entries;
}

/** Stable sorted list of canonical provider ids (for host contract tests). */
export function listFranchiseProviderIds(
  descriptors: readonly FranchiseProviderDescriptor[] = FRANCHISE_PROVIDER_CATALOG,
): readonly string[] {
  return Object.freeze([...descriptors.map((row) => row.id)].sort());
}

export function getFranchiseProvider(
  id: string,
  descriptors: readonly FranchiseProviderDescriptor[] = FRANCHISE_PROVIDER_CATALOG,
): FranchiseProviderDescriptor | undefined {
  return descriptors.find((row) => row.id === id);
}
