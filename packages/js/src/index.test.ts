import assert from "node:assert/strict";
import { test } from "node:test";
import { validate, listBidders } from "./index.js";

test("validate appnexus pbjs params", async () => {
  const res = await validate("pbjs", "appnexus", { placementId: 12345 });
  assert.equal(res.valid, true);
});

test("list bidders", async () => {
  const codes = await listBidders();
  assert.ok(codes.includes("appnexus"));
});
