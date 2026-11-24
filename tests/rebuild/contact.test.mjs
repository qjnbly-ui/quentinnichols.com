import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../../api/public-contact.ts";
const response = () => ({
  headers: {},
  code: 0,
  setHeader(k, v) {
    this.headers[k] = v;
  },
  status(code) {
    this.code = code;
    return this;
  },
  json(value) {
    this.body = value;
  },
});
test("contact integration limits its response to public contact fields and handles service failure", async () => {
  const original = global.fetch;
  try {
    global.fetch = async () =>
      Response.json({
        card: {
          slug: "quentin-nichols",
          email: "public@example.com",
          phone_e164: "+15415550100",
          owner_user_id: "never-return",
          display_sections: [
            { title: "Personal", urls: ["mailto:personal@example.com"] },
          ],
        },
      });
    const res = response();
    await handler({ method: "GET" }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body, {
      card: {
        email: "public@example.com",
        phone: "+15415550100",
        personalEmail: "personal@example.com",
      },
    });
    const denied = response();
    await handler({ method: "POST" }, denied);
    assert.equal(denied.code, 405);
    global.fetch = async () => {
      throw new Error("Offline");
    };
    const unavailable = response();
    await handler({ method: "GET" }, unavailable);
    assert.equal(unavailable.code, 503);
    assert.equal(unavailable.headers["Cache-Control"], "no-store");
  } finally {
    global.fetch = original;
  }
});
