"use strict";
// Run inside `firebase emulators:exec`, with playwright available via NODE_PATH.
const assert = require("node:assert/strict"),
  http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  projectId = "demo-ptbo-feedback";
const sdkVersion = "12.5.0";
const config = {
  enabled: true,
  firebase: { apiKey: "fake-api-key", projectId, authDomain: "localhost" },
  emulators: {
    auth: "http://127.0.0.1:9098",
    firestore: { host: "127.0.0.1", port: 8086 },
  },
};
const configSource = `export const feedbackConfig=${JSON.stringify(config)};`;
const mime = {
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
};
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split("?")[0]);
  if (name === "/feedback/config.mjs") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(configSource);
    return;
  }
  const file = path.resolve(
    root,
    "." + (name.endsWith("/") ? name + "index.html" : name),
  );
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      mime[path.extname(file)] || "application/octet-stream",
    );
    res.end(data);
  });
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--no-sandbox"],
  });
  const contexts = [];
  async function player(viewport = { width: 1280, height: 850 }) {
    const ctx = await browser.newContext({ viewport });
    contexts.push(ctx);
    if (process.env.PTBO_FEEDBACK_SDK_CACHE)
      await ctx.route(
        `https://www.gstatic.com/firebasejs/${sdkVersion}/*`,
        async (route) => {
          const file = path.join(
            process.env.PTBO_FEEDBACK_SDK_CACHE,
            new URL(route.request().url()).pathname.split("/").pop(),
          );
          await route.fulfill({
            path: file,
            contentType: "text/javascript",
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        },
      );
    const page = await ctx.newPage();
    await page.goto(base + "/");
    return page;
  }
  const waitFor = async (fn) => {
    for (let i = 0; i < 60; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("condition did not become true");
  };
  async function register(page, email) {
    await page.locator("#feedback-create").click();
    await page.locator("#feedback-email").fill(email);
    await page.locator("#feedback-password").fill("Test-pass-739!");
    await page.locator("#feedback-auth-submit").click();
    await page.locator("#feedback-new").waitFor();
  }
  try {
    const a = await player();
    await a.locator("#ptbo-feedback-dialog[open]").waitFor({ timeout: 10000 });
    await a.locator("#feedback-guest").click();
    assert.equal(
      await a.locator("#ptbo-feedback-dialog").evaluate((e) => e.open),
      false,
    );
    assert.equal(await a.locator("#ptbo-feedback-entry").count(), 1);
    await a.locator("#ptbo-feedback-entry").click();
    await a.locator("#feedback-new").waitFor();
    await a.locator("#feedback-new").click();
    await a.locator("#feedback-title").fill("Bridge curb");
    await a
      .locator("#feedback-body")
      .fill('Curb is too high. <img src=x onerror="window.injected=true">');
    await a.locator("#feedback-category").selectOption("map");
    await a.locator("#feedback-create-thread").click();
    await a.locator("[data-message-id]").waitFor();
    const guestUid = await a.evaluate(() => PTBO_FEEDBACK.service.account.uid);
    const threadId = await a
      .locator("[data-thread-id]")
      .first()
      .getAttribute("data-thread-id");
    await a.locator("#feedback-account").click();
    await register(a, `alice-${Date.now()}@example.test`);
    assert.equal(
      await a.evaluate(() => PTBO_FEEDBACK.service.account.uid),
      guestUid,
      "registration must retain guest identity",
    );
    await a.locator(`[data-thread-id="${threadId}"]`).click();
    await a.locator("[data-message-id]").waitFor();
    assert.equal(await a.locator("[data-message-id]").count(), 1);
    assert.equal(await a.evaluate(() => window.injected), undefined);
    assert.equal(await a.locator("[data-message-id] img").count(), 0);
    const b = await player({ width: 390, height: 844 }),
      bobEmail = `bob-${Date.now()}@example.test`;
    await register(b, bobEmail);
    assert.equal(await b.locator("[data-thread-id]").count(), 0);
    const denied = await b.evaluate(async (id) => {
      try {
        await PTBO_FEEDBACK.service.loadMessages(id);
        return false;
      } catch (e) {
        return e.code === "permission-denied";
      }
    }, threadId);
    assert.equal(denied, true);
    const admin = await player(),
      adminEmail = `developer-${Date.now()}@example.test`;
    await register(admin, adminEmail);
    const adminUid = await admin.evaluate(
      () => PTBO_FEEDBACK.service.account.uid,
    );
    const { initializeApp } = require("firebase-admin/app"),
      { getAuth } = require("firebase-admin/auth");
    const adminApp = initializeApp({ projectId }, "feedback-browser-test");
    await getAuth(adminApp).setCustomUserClaims(adminUid, {
      feedbackAdmin: true,
    });
    await admin.locator("#feedback-account").click();
    await admin.locator("#feedback-signout").click();
    await admin.locator("#feedback-signin").click();
    await admin.locator("#feedback-email").fill(adminEmail);
    await admin.locator("#feedback-password").fill("Test-pass-739!");
    await admin.locator("#feedback-auth-submit").click();
    await admin.locator("#feedback-developer").click();
    await admin.locator(`[data-thread-id="${threadId}"]`).click();
    await admin
      .locator("#feedback-reply")
      .fill("Thanks. I am checking the bridge.");
    await admin.locator("#feedback-send").click();
    await waitFor(
      async () => (await a.locator("[data-message-id]").count()) === 2,
    );
    await admin.locator("#feedback-status").selectOption("reviewing");
    await admin.locator("#feedback-priority").selectOption("high");
    await admin.locator(".fb-notes summary").click();
    await admin
      .locator("#feedback-note")
      .fill("Check municipal pavement reference.");
    await admin.locator("#feedback-add-note").click();
    await admin
      .getByText("Check municipal pavement reference.", { exact: true })
      .waitFor();
    assert.equal(
      await a
        .getByText("Check municipal pavement reference.", { exact: true })
        .count(),
      0,
    );
    await a.locator("#feedback-close").click();
    // The server remains authoritative even if this device clock is behind.
    await admin.evaluate(() => { window.originalFeedbackNow = Date.now; Date.now = () => window.originalFeedbackNow() - (new Error().stack.includes("feedback/service.mjs") ? 300000 : 0); });
    await admin.locator("#feedback-reply").fill("Second update.");
    await new Promise((r) => setTimeout(r, 1100));
    await admin.locator("#feedback-send").click();
    await waitFor(
      async () =>
        (await a
          .locator("#ptbo-feedback-entry")
          .getAttribute("data-unread")) === "true",
    );
    await a.locator("#ptbo-feedback-entry").click();
    await a.locator(`[data-thread-id="${threadId}"]`).click();
    await waitFor(
      async () =>
        (await a
          .locator("#ptbo-feedback-entry")
          .getAttribute("data-unread")) === "false",
    );
    await admin.evaluate(() => { Date.now = window.originalFeedbackNow; delete window.originalFeedbackNow; });
    await a.locator("#feedback-reply").fill("Please retain this draft.");
    await a.context().setOffline(true);
    await a.locator("#feedback-send").click();
    await a.waitForTimeout(500);
    assert.equal(
      await a.locator("#feedback-reply").inputValue(),
      "Please retain this draft.",
    );
    await a.context().setOffline(false);
    await waitFor(
      async () => !(await a.locator("#feedback-send").isDisabled()),
    );
    await a.locator("#feedback-send").click();
    await waitFor(
      async () => (await a.locator("[data-message-id]").count()) === 4,
    );
    assert.equal(await a.locator("[data-message-id]").count(), 4);
    await a.locator("#feedback-account").click();
    await a.locator("#feedback-signout").click();
    assert.equal(
      await a.getByText("Curb is too high.", { exact: false }).count(),
      0,
    );
    assert.equal(await a.evaluate(() => PTBO_FEEDBACK.service.account), null);
    await a.locator("#feedback-signin").click();
    await a.locator("#feedback-email").fill(bobEmail);
    await a.locator("#feedback-password").fill("Test-pass-739!");
    await a.locator("#feedback-auth-submit").click();
    await a.locator("#feedback-new").waitFor();
    await a.context().setOffline(true);
    const cachedPrivateRows = await a.evaluate(async (id) => {
      try {
        return (await PTBO_FEEDBACK.service.loadMessages(id)).rows.map(
          (x) => x.body,
        );
      } catch {
        return [];
      }
    }, threadId);
    assert.deepEqual(
      cachedPrivateRows,
      [],
      "a different signed-in user must not receive the previous user’s cached private messages",
    );
    await a.context().setOffline(false);
    await b.locator("#feedback-new").click();
    await b.evaluate(() => {
      window.gameKeys = 0;
      window.addEventListener("keydown", (event) => {
        if (event.key === "w") window.gameKeys++;
      });
    });
    await b.locator("#feedback-body").fill("");
    await b.locator("#feedback-body").press("w");
    assert.equal(await b.evaluate(() => window.gameKeys), 0);
    await b.locator("#feedback-cancel-new").click();
    await b.screenshot({
      path: "/tmp/ptbo-feedback-mobile.png",
      fullPage: true,
    });
    const bounds = await b.locator("#ptbo-feedback-dialog").boundingBox();
    assert.ok(
      bounds.x >= 0 && bounds.x + bounds.width <= 391 && bounds.height <= 844,
    );
    await admin.screenshot({
      path: "/tmp/ptbo-feedback-developer.png",
      fullPage: true,
    });
    console.log(
      "PASS: guest skip, guest linking, privacy, developer reply/notes, unread, offline retry, sign-out isolation, mobile viewport.",
    );
  } finally {
    for (const c of contexts) await c.close();
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
