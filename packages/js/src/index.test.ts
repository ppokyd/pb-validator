import assert from "node:assert/strict";
import { test } from "node:test";
import { validate, listBidders, getSchema, loadManifest } from "./index.js";

test("validate appnexus pbjs params", async () => {
  const res = await validate("pbjs", "appnexus", { placementId: 12345 });
  assert.equal(res.valid, true);
});

test("ci_fixture rejects missing token", async () => {
  const res = await validate("pbjs", "ci_fixture", {});
  assert.equal(res.valid, false);
  assert.ok(res.errors && res.errors.length > 0);
});

test("ci_fixture accepts token", async () => {
  const res = await validate("pbjs", "ci_fixture", { token: "x" });
  assert.equal(res.valid, true);
});

test("getSchema returns object schema for ci_fixture", async () => {
  const schema = await getSchema("pbjs", "ci_fixture");
  assert.equal(schema.type, "object");
});

test("loadManifest has version and bidders", async () => {
  const m = await loadManifest();
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
  assert.ok(m.bidders.appnexus);
  assert.ok(m.bidders.ci_fixture);
});

test("list bidders is sorted and includes fixtures", async () => {
  const codes = await listBidders();
  assert.deepEqual(codes, [...codes].sort());
  assert.ok(codes.includes("appnexus"));
  assert.ok(codes.includes("ci_fixture"));
});

test("unknown bidder throws", async () => {
  await assert.rejects(() => validate("pbjs", "not-a-real-bidder", {}), /unknown bidder/);
});

test("pbs missing schema throws", async () => {
  await assert.rejects(() => validate("pbs", "1accord", {}), /no pbs schema/);
});
