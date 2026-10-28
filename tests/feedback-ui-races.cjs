"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file =
    pathname === "/" || pathname === "/station-fixture.html"
      ? "tests/fixtures/feedback-ui.html"
      : pathname.slice(1);
  const full = path.resolve(root, file);
  if (!full.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      full.endsWith(".css")
        ? "text/css"
        : full.endsWith(".html")
          ? "text/html"
          : "text/javascript",
    );
    res.end(
      pathname === "/station-fixture.html"
        ? data
            .toString()
            .replace(
              '<header class="site-header">Training</header>',
              '<main><div class="picker-content"><header class="picker-heading">Choose a station</header></div></main>',
            )
        : data,
    );
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
  let failed = 0;
  async function scenario(name, run, viewport = { width: 1000, height: 800 }) {
    const page = await browser.newPage({ viewport });
    try {
      await page.goto(base);
      await page.locator("#ptbo-feedback-entry").click();
      await page.locator('[data-thread-id="alice"]').click();
      await run(page);
      console.log("PASS", name);
    } catch (error) {
      failed++;
      console.error("FAIL", name, error.message);
    } finally {
      await page.close();
    }
  }
  try {
    await scenario(
      "older messages never populate a different account",
      async (p) => {
        await p
          .getByRole("button", { name: "Earlier messages", exact: true })
          .click();
        await p.evaluate(() => fixture.change("bob"));
        await p
          .getByRole("button", { name: "My conversations", exact: true })
          .click();
        await p.locator('[data-thread-id="bob"]').click();
        await p.evaluate(() => fixture.resolveMessages());
        await p.waitForTimeout(30);
        assert.equal(
          await p.locator('[data-message-id="old-secret"]').count(),
          0,
        );
      },
    );
    await scenario(
      "role downgrade clears developer-only content",
      async (p) => {
        await p.locator('[data-thread-id="alice"]').click();
        assert.equal(
          await p.getByText("Secret developer note", { exact: true }).count(),
          1,
        );
        await p.evaluate(() => fixture.change("alice", false));
        assert.equal(
          await p.getByText("Secret developer note", { exact: true }).count(),
          0,
        );
      },
    );
    await scenario(
      "retry after navigation retains submission identity",
      async (p) => {
        await p.locator("#feedback-reply").fill("Same draft");
        await p.locator("#feedback-send").click();
        await p
          .locator(".fb-compose .fb-error")
          .filter({ hasText: "Connection lost" })
          .waitFor();
        await p.locator("#feedback-close").click();
        await p.locator("#ptbo-feedback-entry").click();
        await p.locator('[data-thread-id="alice"]').click();
        assert.equal(
          await p.locator("#feedback-reply").inputValue(),
          "Same draft",
        );
        await p.locator("#feedback-send").click();
        const sends = await p.evaluate(() => fixture.sends);
        assert.equal(sends[0].messageId, sends[1].messageId);
      },
    );
    await scenario(
      "pending new report keeps IDs after reopening",
      async (p) => {
        await p.evaluate(() => fixture.change('alice', false));
        await p.evaluate(() => PTBO_FEEDBACK.open());
        await p.locator("#feedback-new").click();
        await p.locator("#feedback-title").fill("New topic");
        await p.locator("#feedback-body").fill("New report");
        await p.evaluate(() => (fixture.deferSend = true));
        await p.locator("#feedback-create-thread").click();
        await p.locator("#feedback-close").click();
        await p.locator("#ptbo-feedback-entry").click();
        await p.locator("#feedback-new").click();
        await p.locator("#feedback-title").fill("New topic");
        await p.locator("#feedback-create-thread").click();
        const sends = await p.evaluate(() => fixture.sends);
        assert.equal(sends[0].threadId, sends[1].threadId);
        assert.equal(sends[0].messageId, sends[1].messageId);
      },
    );
    await scenario(
      "completed old send cannot replace a newer view",
      async (p) => {
        await p.evaluate(() => fixture.change('alice', false));
        await p.evaluate(() => PTBO_FEEDBACK.open());
        await p.locator("#feedback-new").click();
        await p.locator("#feedback-title").fill("New topic");
        await p.locator("#feedback-body").fill("New report");
        await p.evaluate(() => (fixture.deferSend = true));
        await p.locator("#feedback-create-thread").click();
        await p.locator("#feedback-cancel-new").click();
        await p.locator('[data-thread-id="alice"]').click();
        await p.evaluate(() => fixture.ack());
        await p.waitForTimeout(30);
        assert.equal(
          await p.locator(".fb-detail-header h3").textContent(),
          "alice topic",
        );
      },
    );
    await scenario(
      "short viewport keeps Send reachable",
      async (p) => {
        await p.locator(".fb-back").click();
        await p.locator('[data-thread-id="alice"]').click();
        await p.locator(".fb-detail").evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        const send = await p.locator("#feedback-send").boundingBox(),
          dialog = await p.locator("#ptbo-feedback-dialog").boundingBox();
        assert.ok(
          send.y >= dialog.y &&
            send.y + send.height <= dialog.y + dialog.height,
          JSON.stringify({ send, dialog }),
        );
      },
      { width: 390, height: 400 },
    );
    await scenario(
      "live updates preserve oldest pagination cursor",
      async (p) => {
        await p.evaluate(() => fixture.change('alice', false));
        await p.evaluate(() => PTBO_FEEDBACK.open());
        await p.evaluate(() => { fixture.cursors = []; });
        await p.locator("#feedback-more-threads").click();
        await p.evaluate(() => fixture.updateThreads());
        await p.locator("#feedback-more-threads").click();
        assert.deepEqual(await p.evaluate(() => fixture.cursors), [
          "first",
          "older",
        ]);
      },
    );
    await scenario("open thread status reflects live updates", async (p) => {
      await p.evaluate(() => fixture.updateStatus());
      assert.match(
        await p.locator(".fb-detail-header small").textContent(),
        /Under review/,
      );
    });
    const station = await browser.newPage();
    try {
      await station.goto(base + "/station-fixture.html");
      await station.waitForFunction(() => window.fixture);
      assert.equal(await station.locator("#ptbo-feedback-entry").count(), 1);
      console.log("PASS station picker entry");
    } catch (error) {
      failed++;
      console.error("FAIL station picker entry", error.message);
    } finally {
      await station.close();
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
  if (failed) throw new Error(`${failed} UI regression scenarios failed`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
