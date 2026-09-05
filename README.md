# Franchise MCP Store UI

One visual source of truth for the searchable connector directory used by the
StillPoint integrations portal and organization onboarding flows. Consumers
own authentication, tenant data, navigation, and provider artwork; this package
owns the accessible layout and interaction model.

```tsx
<McpStore entries={entries} renderIcon={(entry, size) => <Logo id={entry.id} size={size} />} />
```
