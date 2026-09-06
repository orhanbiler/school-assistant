import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);");
await db.exec(await readFile(new URL("../supabase/migrations/202609060001_private_usage.sql", import.meta.url), "utf8"));
after(() => db.close());
async function newOwner() {
  const id = randomUUID();
  await db.query("insert into auth.users values ($1)", [id]);
  return id;
}
async function reserve(owner, lease = randomUUID(), limits = [5, 20, 40, 300]) {
  const { rows } = await db.query("select public.reserve_ai_generation($1, $2, $3) as result", [owner, lease, limits]);
  return rows[0].result;
}
async function release(owner, lease) { await db.query("select public.release_ai_generation($1, $2)", [owner, lease]); }

test("database serializes reservations, counts once, and releases only the matching lease", async () => {
  const owner = await newOwner();
  const lease = randomUUID();
  assert.deepEqual(await reserve(owner, lease), [1, 0, 0]);
  const competing = await Promise.all(Array.from({ length: 8 }, () => reserve(owner)));
  assert.ok(competing.every((result) => result[0] === 0 && result[1] === 5));
  await release(owner, randomUUID());
  assert.equal((await reserve(owner))[1], 5);
  await release(owner, lease);
  const { rows } = await db.query("select counts, active_request from private.ai_usage where owner_id=$1", [owner]);
  assert.deepEqual(rows[0].counts, [1, 1, 1, 1]);
  assert.equal(rows[0].active_request, null);
  assert.deepEqual(await reserve(owner), [1, 0, 0]);
});

test("each quota window blocks further usage and expired windows restart", async () => {
  for (let i = 0; i < 4; i++) {
    const owner = await newOwner();
    const lease = randomUUID();
    const limits = [5, 20, 40, 300]; limits[i] = 1;
    assert.equal((await reserve(owner, lease, limits))[0], 1);
    await release(owner, lease);
    const denied = await reserve(owner, randomUUID(), limits);
    assert.equal(denied[0], 0);
    assert.equal(denied[1], i + 1);
    assert.ok(denied[2] > 0);
    await db.query("update private.ai_usage set resets_at[$2] = 'epoch' where owner_id=$1", [owner, i + 1]);
    assert.equal((await reserve(owner, randomUUID(), limits))[0], 1);
  }
});

test("stale leases expire while accumulated usage remains counted", async () => {
  const owner = await newOwner();
  await reserve(owner);
  await db.query("update private.ai_usage set active_until = 'epoch' where owner_id=$1", [owner]);
  assert.equal((await reserve(owner))[0], 1);
  const { rows } = await db.query("select counts from private.ai_usage where owner_id=$1", [owner]);
  assert.deepEqual(rows[0].counts, [2, 2, 2, 2]);
});

test("anonymous and signed-in clients cannot read, reset, reserve or release usage", async () => {
  const owner = await newOwner();
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      for (const sql of ["select * from private.ai_usage", "delete from private.ai_usage", `select public.reserve_ai_generation('${owner}', '${randomUUID()}', array[5,20,40,300])`, `select public.release_ai_generation('${owner}', '${randomUUID()}')`]) await assert.rejects(db.query(sql), /permission denied/);
    } finally { await db.exec("reset role"); }
  }
  await db.exec("set role service_role");
  try { assert.equal((await reserve(owner))[0], 1); }
  finally { await db.exec("reset role"); }
});

test("invalid limits cannot create unbounded quota windows", async () => {
  const owner = await newOwner();
  for (const limits of [null, [], [1, 2], [0, 20, 40, 300], [5, 20, 40, 999999], [5, null, 40, 300]]) await assert.rejects(reserve(owner, randomUUID(), limits), /Invalid usage/);
});
