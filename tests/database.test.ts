import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
let db: PGlite;
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  c = "33333333-3333-4333-8333-333333333333";
let ta: string, tb: string;
before(async () => {
  db = new PGlite({ extensions: { vector } });
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;`,
  );
  for (const migration of (await readdir("packages/api/supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(
      await readFile("packages/api/supabase/migrations/" + migration, "utf8"),
    );
  }
  await db.query("insert into auth.users(id) values($1),($2),($3)", [a, b, c]);
  ta = (
    await db.query<{ id: string }>(
      "select public.provision_workspace($1,$2,$3) id",
      [a, "a@example.com", "A"],
    )
  ).rows[0].id;
  tb = (
    await db.query<{ id: string }>(
      "select public.provision_workspace($1,$2,$3) id",
      [b, "b@example.com", "B"],
    )
  ).rows[0].id;
  await db.query(
    "insert into public.macros(team_id,name,content) values($1,'Private A','Team A confidential guidance'),($2,'Private B','Team B confidential guidance')",
    [ta, tb],
  );
});
after(async () => {
  await db?.close();
});
async function asUser(id: string, fn: () => Promise<void>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
  try {
    await fn();
  } finally {
    await db.exec("reset role");
  }
}
test("migration enables RLS on every application table", async () => {
  const r = await db.query<{ name: string }>(
    "select relname name from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity",
  );
  assert.deepEqual(r.rows, []);
});
test("provisioning is idempotent and preserves membership", async () => {
  const r = await db.query<{ id: string }>(
    "select public.provision_workspace($1,$2,$3) id",
    [a, "a@example.com", "New"],
  );
  assert.equal(r.rows[0].id, ta);
});
test("tenant cannot read another tenant macros or team", async () => {
  await asUser(a, async () => {
    const r = await db.query<{ name: string }>(
      "select name from public.macros",
    );
    assert.deepEqual(
      r.rows.map((x) => x.name),
      ["Private A"],
    );
    assert.equal(
      (await db.query("select * from public.teams where id=$1", [tb])).rows
        .length,
      0,
    );
  });
});
test("browser cannot mutate roles or quotas even for its own team", async () => {
  await asUser(a, async () => {
    await assert.rejects(
      db.query("update public.users set role='owner' where id=$1", [a]),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        "update public.teams set monthly_draft_limit=99999 where id=$1",
        [ta],
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.reserve_draft($1,$2,$3,$4)", [
        ta,
        a,
        crypto.randomUUID(),
        "gmail",
      ]),
      /permission denied/,
    );
  });
});
test("anonymous access and platform secret table access fail closed", async () => {
  await db.exec("set role anon");
  try {
    await assert.rejects(
      db.query("select * from public.macros"),
      /permission denied/,
    );
  } finally {
    await db.exec("reset role");
  }
  await asUser(a, async () => {
    for (const table of [
      "platform_settings",
      "extension_tokens",
      "team_invites",
      "banned_emails",
      "audit_events",
    ])
      await assert.rejects(
        db.query("select * from public." + table),
        /permission denied/,
      );
  });
});
test("cross-team child relationships are rejected", async () => {
  const doc = (
    await db.query<{ id: string }>("select public.add_knowledge($1,$2,$3) id", [
      ta,
      "Policy",
      JSON.stringify(["Policy text"]),
    ])
  ).rows[0].id;
  await assert.rejects(
    db.query(
      "insert into public.document_chunks(team_id,document_id,chunk_index,chunk_text) values($1,$2,1,$3)",
      [tb, doc, "Foreign team"],
    ),
    /foreign key/,
  );
});
test("duplicate requests count once and quota rejects an extra request", async () => {
  await db.query("update public.teams set monthly_draft_limit=2 where id=$1", [
    ta,
  ]);
  const id = crypto.randomUUID();
  await db.query("select public.reserve_draft($1,$2,$3,$4)", [
    ta,
    a,
    id,
    "gmail",
  ]);
  const duplicate = await db.query<{ r: { existing: boolean } }>(
    "select public.reserve_draft($1,$2,$3,$4) r",
    [ta, a, id, "gmail"],
  );
  assert.equal(duplicate.rows[0].r.existing, true);
  await db.query("select public.reserve_draft($1,$2,$3,$4)", [
    ta,
    a,
    crypto.randomUUID(),
    "gmail",
  ]);
  await assert.rejects(
    db.query("select public.reserve_draft($1,$2,$3,$4)", [
      ta,
      a,
      crypto.randomUUID(),
      "gmail",
    ]),
    /QUOTA_EXCEEDED/,
  );
  assert.equal(
    (
      await db.query<{ n: number }>(
        "select draft_count n from public.usage where team_id=$1",
        [ta],
      )
    ).rows[0].n,
    2,
  );
});
test("failed draft refunds its reservation only once", async () => {
  const r = await db.query<{ id: string }>(
    "select id from public.draft_history where team_id=$1 limit 1",
    [ta],
  );
  await db.query("select public.fail_draft($1,$2)", [ta, r.rows[0].id]);
  await db.query("select public.fail_draft($1,$2)", [ta, r.rows[0].id]);
  assert.equal(
    (
      await db.query<{ n: number }>(
        "select draft_count n from public.usage where team_id=$1",
        [ta],
      )
    ).rows[0].n,
    1,
  );
});
test("foreign user cannot reserve against another workspace", async () => {
  await assert.rejects(
    db.query("select public.reserve_draft($1,$2,$3,$4)", [
      tb,
      a,
      crypto.randomUUID(),
      "gmail",
    ]),
    /FORBIDDEN/,
  );
});
test("suspended workspace cannot reserve drafts", async () => {
  await db.query("update public.teams set frozen=true where id=$1", [tb]);
  await assert.rejects(
    db.query("select public.reserve_draft($1,$2,$3,$4)", [
      tb,
      b,
      crypto.randomUUID(),
      "gmail",
    ]),
    /WORKSPACE_DISABLED/,
  );
  await db.query("update public.teams set frozen=false where id=$1", [tb]);
});
test("extension pairing codes are single-use and expire", async () => {
  await db.query(
    "insert into public.extension_codes values('code',$1,$2,now()+interval '5 minutes')",
    [ta, a],
  );
  await db.query("select public.redeem_extension('code','hash1')");
  await assert.rejects(
    db.query("select public.redeem_extension('code','hash2')"),
    /INVALID_CODE/,
  );
  await db.query(
    "insert into public.extension_codes values('expired',$1,$2,now()-interval '1 minute')",
    [ta, a],
  );
  await assert.rejects(
    db.query("select public.redeem_extension('expired','hash3')"),
    /INVALID_CODE/,
  );
});
test("invite is bound to recipient email and is single-use", async () => {
  await db.query(
    "insert into public.team_invites(team_id,email,role,token_hash,expires_at) values($1,'c@example.com','member','invite',now()+interval '1 day')",
    [tb],
  );
  await assert.rejects(
    db.query("select public.accept_invite('invite',$1,'wrong@example.com')", [
      c,
    ]),
    /INVALID_INVITE/,
  );
  await assert.rejects(
    db.query("select public.accept_invite('invite',$1,'c@example.com')", [c]),
    /NO_SEAT_AVAILABLE/,
  );
  await db.query("update public.teams set seat_limit=2 where id=$1", [tb]);
  await db.query("select public.accept_invite('invite',$1,'c@example.com')", [
    c,
  ]);
  await assert.rejects(
    db.query("select public.accept_invite('invite',$1,'c@example.com')", [c]),
    /INVALID_INVITE/,
  );
});
test("rate limiter stops requests at the configured limit", async () => {
  const first = await db.query<{ ok: boolean }>(
    "select public.consume_rate_limit('test',1,60) ok",
  );
  const second = await db.query<{ ok: boolean }>(
    "select public.consume_rate_limit('test',1,60) ok",
  );
  assert.equal(first.rows[0].ok, true);
  assert.equal(second.rows[0].ok, false);
});
test("billing events are idempotent and older events cannot overwrite newer state", async () => {
  await db.query(
    "update public.teams set stripe_customer_id='cus_test' where id=$1",
    [tb],
  );
  await db.query(
    "select public.apply_subscription('evt_new',200,'cus_test','sub_new',true,3)",
  );
  await db.query(
    "select public.apply_subscription('evt_old',100,'cus_test','sub_old',false,1)",
  );
  const r = await db.query<{ plan: string; monthly_draft_limit: number }>(
    "select plan,monthly_draft_limit from public.teams where id=$1",
    [tb],
  );
  assert.equal(r.rows[0].plan, "team");
  assert.equal(r.rows[0].monthly_draft_limit, 3000);
  const dupe = await db.query<{ ok: boolean }>(
    "select public.apply_subscription('evt_new',200,'cus_test','sub_new',true,3) ok",
  );
  assert.equal(dupe.rows[0].ok, false);
});
test("retention removes expired drafts and stale pairing codes", async () => {
  await db.query(
    "update public.draft_history set created_at=now()-interval '100 days' where team_id=$1",
    [ta],
  );
  await db.query("select public.cleanup_retention()");
  assert.equal(
    (
      await db.query("select id from public.draft_history where team_id=$1", [
        ta,
      ])
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select * from public.extension_codes where code_hash='expired'",
      )
    ).rows.length,
    0,
  );
});

test("owner can change roles, but cannot remove the owner or a foreign member", async () => {
  await db.query("select public.manage_member($1,$2,$3,'role','admin')", [
    tb,
    b,
    c,
  ]);
  assert.equal(
    (
      await db.query<{ role: string }>(
        "select role from public.team_members where user_id=$1",
        [c],
      )
    ).rows[0].role,
    "admin",
  );
  await assert.rejects(
    db.query("select public.manage_member($1,$2,$3,'remove')", [tb, c, b]),
    /FORBIDDEN/,
  );
  await assert.rejects(
    db.query("select public.manage_member($1,$2,$3,'remove')", [tb, b, a]),
    /FORBIDDEN/,
  );
});
test("seat downgrade preserves owner access and blocks excess members", async () => {
  await db.query("update public.teams set seat_limit=1 where id=$1", [tb]);
  assert.equal(
    (
      await db.query<{ ok: boolean }>(
        "select public.has_workspace_seat($1,$2) ok",
        [tb, b],
      )
    ).rows[0].ok,
    true,
  );
  assert.equal(
    (
      await db.query<{ ok: boolean }>(
        "select public.has_workspace_seat($1,$2) ok",
        [tb, c],
      )
    ).rows[0].ok,
    false,
  );
  await db.query("update public.teams set seat_limit=2 where id=$1", [tb]);
});
test("removing a member revokes their extension tokens but retains team drafts", async () => {
  const reserved = await db.query<{ r: { record: { id: string } } }>(
    "select public.reserve_draft($1,$2,$3,$4) r",
    [tb, c, crypto.randomUUID(), "gmail"],
  );
  await db.query(
    "insert into public.extension_tokens(team_id,user_id,token_hash,expires_at) values($1,$2,'member-token',now()+interval '1 day')",
    [tb, c],
  );
  await db.query("select public.manage_member($1,$2,$3,'remove')", [tb, b, c]);
  assert.equal(
    (
      await db.query(
        "select id from public.extension_tokens where user_id=$1",
        [c],
      )
    ).rows.length,
    0,
  );
  const draft = await db.query<{ user_id: string | null }>(
    "select user_id from public.draft_history where id=$1",
    [reserved.rows[0].r.record.id],
  );
  assert.equal(draft.rows[0].user_id, null);
});
test("service RPCs do not run as definer and cannot be executed by browsers", async () => {
  const funcs = await db.query<{ proname: string }>(
    "select proname from pg_proc where pronamespace='public'::regnamespace and prosecdef",
  );
  assert.deepEqual(funcs.rows, []);
  await asUser(a, async () => {
    await assert.rejects(
      db.query("select public.manage_member($1,$2,$3,'remove')", [tb, b, c]),
      /permission denied/,
    );
  });
});
test("service role can execute the invoker routines using explicit grants", async () => {
  await db.exec("set role service_role");
  try {
    const result = await db.query<{ ok: boolean }>(
      "select public.has_workspace_seat($1,$2) ok",
      [ta, a],
    );
    assert.equal(result.rows[0].ok, true);
    await db.query("select public.provision_workspace($1,$2,$3)", [
      c,
      "c@example.com",
      "New workspace",
    ]);
  } finally {
    await db.exec("reset role");
  }
});
test("RLS also denies direct reads after banning a user or suspending a workspace", async () => {
  await db.query(
    "insert into public.banned_emails(email) values('a@example.com')",
  );
  await asUser(a, async () => {
    assert.equal(
      (await db.query("select * from public.macros")).rows.length,
      0,
    );
  });
  await db.query(
    "delete from public.banned_emails where email='a@example.com'",
  );
  await db.query("update public.teams set frozen=true where id=$1", [ta]);
  await asUser(a, async () => {
    assert.equal(
      (await db.query("select * from public.macros")).rows.length,
      0,
    );
  });
  await db.query("update public.teams set frozen=false where id=$1", [ta]);
});

test("audit #1: an unprovisioned authenticated user cannot inject an admin profile into a known team", async () => {
  const unprovisioned = "44444444-4444-4444-8444-444444444444";
  await db.query("insert into auth.users(id) values($1)", [unprovisioned]);
  await asUser(unprovisioned, async () => {
    await assert.rejects(
      db.query(
        "insert into public.users(id,email,team_id,role) values($1,'attacker@example.com',$2,'admin')",
        [unprovisioned, ta],
      ),
      /permission denied/,
    );
  });
});
