import test from "node:test";
import assert from "node:assert/strict";

const model = await import("../feedback/model.mjs").catch(() => ({}));
test("new reports validate text and keep bounded game context", () => {
  assert.equal(typeof model.normalizeNewThread, "function");
  const value = model.normalizeNewThread(
    { title: "  Steering issue  ", body: " Cannot turn. ", category: "bug" },
    {
      city: "toronto",
      mode: "dispatch",
      department: "ems",
      version: "1.6.132",
    },
  );
  assert.deepEqual(value, {
    title: "Steering issue",
    body: "Cannot turn.",
    category: "bug",
    city: "toronto",
    mode: "dispatch",
    department: "ems",
    version: "1.6.132",
  });
  assert.throws(
    () => model.normalizeNewThread({ title: "", body: "x", category: "bug" }),
    /title/i,
  );
  assert.throws(
    () =>
      model.normalizeNewThread({
        title: "x",
        body: " ".repeat(10),
        category: "bug",
      }),
    /message/i,
  );
  assert.throws(
    () =>
      model.normalizeNewThread({
        title: "x",
        body: "x".repeat(4001),
        category: "bug",
      }),
    /4000/,
  );
  assert.throws(
    () =>
      model.normalizeNewThread({ title: "x", body: "x", category: "unknown" }),
    /category/i,
  );
});
test("inbox filters combine city, mode, category, status, unread, and search", () => {
  assert.equal(typeof model.filterThreads, "function");
  const rows = [
    {
      id: "a",
      ownerId: "one",
      title: "Bridge curb",
      city: "peterborough",
      mode: "explorer",
      category: "map",
      status: "new",
      playerMessages: 2,
      developerRead: 0,
      developerMessages: 0,
      playerRead: 0,
      updatedAt: 20,
    },
    {
      id: "b",
      ownerId: "two",
      title: "Brake",
      city: "toronto",
      mode: "dispatch",
      category: "bug",
      status: "resolved",
      playerMessages: 1,
      developerRead: 1,
      developerMessages: 1,
      playerRead: 0,
      updatedAt: 30,
    },
  ];
  assert.deepEqual(
    model
      .filterThreads(
        rows,
        {
          city: "peterborough",
          mode: "explorer",
          category: "map",
          status: "new",
          unread: true,
          search: "BRIDGE",
        },
        "dev",
        true,
      )
      .map((x) => x.id),
    ["a"],
  );
  assert.deepEqual(
    model.filterThreads(rows, { unread: true }, "two", false).map((x) => x.id),
    ["b"],
  );
  assert.equal(model.unreadCount(rows[0], "developer"), 2);
  assert.equal(model.unreadCount(rows[1], "player"), 1);
});
test("service errors are actionable without revealing account existence", () => {
  assert.equal(typeof model.errorMessage, "function");
  assert.equal(
    model.errorMessage({ code: "auth/user-not-found" }),
    model.errorMessage({ code: "auth/wrong-password" }),
  );
  assert.match(model.errorMessage({ code: "permission-denied" }), /access/i);
  assert.match(
    model.errorMessage({ code: "auth/operation-not-allowed" }),
    /unavailable/i,
  );
});
