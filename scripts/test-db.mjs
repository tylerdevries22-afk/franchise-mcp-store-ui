import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { startDatabase } from './db-harness.mjs';

const db = startDatabase();
try {
  // Packaged local shim must apply (and re-apply) on disposable PG — LOCAL/CI ONLY.
  {
    const shim = startDatabase();
    try {
      shim.file('supabase/tests/bootstrap.sql');
      shim.file('supabase/bootstrap/local/vault_shim.sql');
      shim.file('supabase/bootstrap/local/vault_shim.sql');
      const id = shim.sql("select vault.create_secret('test-only-shim')").trim();
      assert.match(id, /^[0-9a-f-]{36}$/i);
    } finally {
      shim.stop();
    }
  }

  db.file('supabase/tests/bootstrap.sql');
  for (const file of readdirSync('supabase/migrations').sort()) {
    db.file(`supabase/migrations/${file}`);
  }
  db.file('supabase/tests/fixtures.sql');
  for (const file of ['isolation.sql', 'oauth.sql', 'atomicity.sql']) db.file(`supabase/tests/${file}`);
  assert.throws(() => db.file('supabase/optional/vault.sql'), 'Missing Vault must fail closed');
  db.file('supabase/tests/vault-contract.sql');
  db.file('supabase/optional/vault.sql');
  db.file('supabase/tests/vault.sql');
  db.file('supabase/verify.sql');
  await Promise.all(Array.from({ length: 8 }, (_, i) => db.concurrent(
    `set role service_role; select public.mcp_store_save_credential('22222222-2222-4222-8222-222222222222',
      '22222222-2222-4222-8222-222222222222','test-only-race-${i}')`)));
  assert.equal(db.sql('select count(*) from vault.secrets').trim(), '2', 'Concurrent credential writes cannot orphan secrets');
  const consume = readFileSync('supabase/tests/consume.sql', 'utf8');
  const results = await Promise.all(Array.from({ length: 8 }, () => db.concurrent(consume)));
  assert.equal(results.filter((value) => value.includes('33333333-3333-4333-8333-333333333333')).length, 1,
    'Exactly one concurrent callback must consume the nonce');
  assert.equal(db.sql("select count(*) from mcp_store_private.audit_events where event='oauth_consumed'").trim(), '1');
  const restored = db.restore();
  assert.equal(restored('select count(*) from public.mcp_store_installations').trim(), '2');
  assert.equal(restored("set role authenticated; set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; select count(*) from public.mcp_store_installations").trim().split('\n').at(-1), '1');
  assert.equal(restored("select has_table_privilege('authenticated','mcp_store_private.credentials','SELECT')").trim(), 'f');
  // A migration version is applied once by the runner: direct replay must fail loudly.
  assert.throws(() => db.file('supabase/migrations/202609080001_mcp_store.sql'));
  console.log('PASS: grants, tenant isolation, write denial, constraints, OAuth bindings/expiry/replay, eight-way race, audit atomicity, dump/restore with RLS.');
  console.log('Vault RPC contracts passed against a test double; encryption and Supabase Auth require staging verification.');
} finally {
  db.stop();
  console.log(`Stopped disposable PostgreSQL; evidence retained at ${db.root}`);
}
