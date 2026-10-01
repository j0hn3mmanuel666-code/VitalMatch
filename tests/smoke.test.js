import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { csrfProtection } from "../middleware/security.js";
import { sanitizeHtml, sanitizeRichHtml, hashToken, validatePassword, getBcryptRounds } from "../middleware/validation.js";

const mockRes = () => {
  const res = { locals: {} };
  res.statusCode = null;
  res.body = null;
  res.redirectedTo = null;
  res.status = (code) => {
    res.statusCode = code;
    return { json: (body) => { res.body = body; } };
  };
  res.redirect = (url) => { res.redirectedTo = url; };
  return res;
};

const mockReq = (overrides = {}) => ({
  method: "GET",
  session: {},
  body: undefined,
  headers: {},
  is: () => false,
  flash: () => {},
  ...overrides,
});

describe("csrfProtection", () => {
  it("issues a 64-char hex token on GET and exposes it to views", () => {
    const req = mockReq({ method: "GET" });
    const res = mockRes();
    let nexted = false;
    csrfProtection(req, res, () => { nexted = true; });
    assert.match(req.session.csrfToken, /^[0-9a-f]{64}$/);
    assert.equal(res.locals.csrfToken, req.session.csrfToken);
    assert.equal(nexted, true);
  });

  it("rejects POST without a token with 403", () => {
    const req = mockReq({ method: "POST", session: { csrfToken: "abc" }, body: {}, headers: {} });
    const res = mockRes();
    let nexted = false;
    csrfProtection(req, res, () => { nexted = true; });
    assert.equal(nexted, false);
    assert.equal(res.statusCode, 403);
  });

  it("accepts POST with a matching X-CSRF-Token header", () => {
    const req = mockReq({
      method: "POST",
      session: { csrfToken: "tok123" },
      body: {},
      headers: { "x-csrf-token": "tok123" },
    });
    const res = mockRes();
    let nexted = false;
    csrfProtection(req, res, () => { nexted = true; });
    assert.equal(nexted, true);
  });

  it("accepts POST with a matching _csrf body field", () => {
    const req = mockReq({
      method: "POST",
      session: { csrfToken: "tok123" },
      body: { _csrf: "tok123" },
      headers: {},
    });
    const res = mockRes();
    let nexted = false;
    csrfProtection(req, res, () => { nexted = true; });
    assert.equal(nexted, true);
  });
});

describe("sanitizers", () => {
  it("sanitizeHtml escapes markup", () => {
    assert.equal(sanitizeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
  });

  it("sanitizeRichHtml strips scripts but keeps formatting", () => {
    const out = sanitizeRichHtml('<b>Hi</b><script>alert(1)</script><a href="javascript:alert(2)">x</a>');
    assert.ok(out.includes("<b>Hi</b>"));
    assert.ok(!out.includes("<script>"));
    assert.ok(!out.includes("javascript:"));
  });

  it("sanitizeRichHtml strips event handlers", () => {
    const out = sanitizeRichHtml('<img src="x.png" onerror="alert(1)">');
    assert.ok(!out.toLowerCase().includes("onerror"));
  });
});

describe("tokens and passwords", () => {
  it("hashToken is a stable 64-char hex digest", () => {
    const a = hashToken("abc123");
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(a, hashToken("abc123"));
    assert.notEqual(a, hashToken("abc124"));
    assert.notEqual(a, "abc123");
  });

  it("validatePassword enforces composition and the 72-char bcrypt cap", () => {
    assert.equal(validatePassword("Abcdef12"), true);
    assert.equal(validatePassword("abcdef12"), false); // no uppercase
    assert.equal(validatePassword("Abcdefgh"), false); // no digit
    assert.equal(validatePassword("Ab1"), false); // too short
    assert.equal(validatePassword(`Ab1${"x".repeat(70)}`), false); // over 72
  });

  it("getBcryptRounds honors BCRYPT_ROUNDS with a safe default", () => {
    const prev = process.env.BCRYPT_ROUNDS;
    process.env.BCRYPT_ROUNDS = "7";
    assert.equal(getBcryptRounds(), 7);
    delete process.env.BCRYPT_ROUNDS;
    assert.equal(getBcryptRounds(), 12);
    if (prev !== undefined) process.env.BCRYPT_ROUNDS = prev;
  });
});
