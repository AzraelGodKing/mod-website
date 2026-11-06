import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteManual, manualDonation, parseKofi, publicSupporters, recordDonation, tokenMatches } from "../src/donors/donors.mjs";

// Ko-fi's webhook: a form post whose `data` field is JSON.
function kofiBody(overrides = {}) {
  const data = {
    verification_token: "secret-token",
    message_id: "3a1fac0c-f960-4506-a60e-824979a74e74",
    timestamp: "2026-11-06T21:00:00Z",
    type: "Donation",
    is_public: true,
    from_name: "Jo Example",
    message: "Love the vault mod!",
    amount: "5.00",
    url: "https://ko-fi.com/Home/CoffeeShop?txid=0a1b2c3d",
    email: "jo@example.com",
    currency: "USD",
    is_subscription_payment: false,
    is_first_subscription_payment: false,
    kofi_transaction_id: "0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
    shop_items: null,
    tier_name: null,
    shipping: null,
    ...overrides,
  };
  return new URLSearchParams({ data: JSON.stringify(data) }).toString();
}

test("a Ko-fi post becomes a donation without the e-mail", () => {
  const parsed = parseKofi(kofiBody());
  assert.equal(parsed.token, "secret-token");
  assert.equal(parsed.donation.id, "kofi:0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d");
  assert.equal(parsed.donation.name, "Jo Example");
  assert.equal(parsed.donation.isPublic, true);
  assert.equal(parsed.donation.createdAt, "2026-11-06T21:00:00.000Z");
  assert.ok(!JSON.stringify(parsed.donation).includes("jo@example.com"));
});

test("private, membership and junk posts", () => {
  assert.equal(parseKofi(kofiBody({ is_public: false })).donation.isPublic, false);
  const member = parseKofi(kofiBody({ type: "Subscription", is_subscription_payment: true, tier_name: "Gold" })).donation;
  assert.equal(member.isSubscription, true);
  assert.equal(member.tier, "Gold");
  assert.equal(parseKofi("data=not-json"), null);
  assert.equal(parseKofi(""), null);
  assert.equal(parseKofi(kofiBody({ kofi_transaction_id: "", message_id: "" })), null);
  assert.equal(parseKofi(kofiBody({ from_name: "  " })).donation.name, "Someone");
  assert.equal(parseKofi(kofiBody({ message: "x".repeat(900) })).donation.message.length, 500);
});

test("the verification token must match exactly", async () => {
  assert.equal(await tokenMatches("secret-token", "secret-token"), true);
  assert.equal(await tokenMatches("secret-tokem", "secret-token"), false);
  assert.equal(await tokenMatches("", "secret-token"), false);
  assert.equal(await tokenMatches("secret-token", undefined), false);
});

test("the public list groups people, drops amounts, and only counts private or hidden ones", () => {
  const rows = [
    { provider: "kofi", name: "Jo", message: null, created_at: "2026-11-05", is_public: 1, hidden: 0, is_subscription: 1, tier: "Gold", amount: "5" },
    { provider: "kofi", name: "Secret", message: "hi", created_at: "2026-11-04", is_public: 0, hidden: 0, is_subscription: 0, amount: "50" },
    { provider: "kofi", name: "jo", message: "Thanks!", created_at: "2026-10-01", is_public: 1, hidden: 0, is_subscription: 0, amount: "3" },
    { provider: "kofi", name: "Spammer", message: "buy stuff", created_at: "2026-09-01", is_public: 1, hidden: 1, is_subscription: 0 },
  ];
  const result = publicSupporters(rows);
  assert.equal(result.anonymous, 2);
  assert.equal(result.supporters.length, 1);
  const [jo] = result.supporters;
  assert.deepEqual(
    { name: jo.name, times: jo.times, first: jo.first, latest: jo.latest, message: jo.message, member: jo.member, tier: jo.tier },
    { name: "Jo", times: 2, first: "2026-10-01", latest: "2026-11-05", message: "Thanks!", member: true, tier: "Gold" },
  );
  assert.ok(!JSON.stringify(result).includes("Secret"));
  assert.ok(!("amount" in jo));
});

test("Ko-fi retries are saved once; only hand-added rows can be deleted", async () => {
  const ids = new Set();
  const db = {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) {
          args = values;
          return statement;
        },
        async run() {
          if (sql.startsWith("INSERT OR IGNORE")) {
            if (ids.has(args[0])) return { meta: { changes: 0 } };
            ids.add(args[0]);
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("DELETE")) return { meta: { changes: ids.delete(args[0]) ? 1 : 0 } };
          return { meta: { changes: 0 } };
        },
      };
      return statement;
    },
  };
  const { donation } = parseKofi(kofiBody());
  assert.equal(await recordDonation(db, donation), true);
  assert.equal(await recordDonation(db, donation), false);
  assert.equal(await deleteManual(db, donation.id), false);
  const manual = manualDonation({ name: "Old friend", date: "2025-12-25", isPublic: true });
  assert.match(manual.id, /^manual:/);
  assert.equal(manual.createdAt, "2025-12-25T00:00:00.000Z");
  await recordDonation(db, manual);
  assert.equal(await deleteManual(db, manual.id), true);
  assert.equal(manualDonation({ name: " " }), null);
});
