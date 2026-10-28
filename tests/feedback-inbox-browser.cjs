"use strict";

// UI/service boundary coverage: deterministic local conversations, no Firebase.
// Run with Playwright available on NODE_PATH, as with feedback-compact-browser.cjs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const fixtureHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Feedback inbox boundary fixture</title></head>
<body><header class="site-header">Training</header><script type="module">
import { mountFeedback } from '/feedback/ui.mjs';
const guest = new URLSearchParams(location.search).has('guest');
const account = guest ? {uid:'guest',isGuest:true,isDeveloper:false} : {uid:'alice',email:'alice@example.test',isGuest:false,isDeveloper:true};
const rows = Array.from({length:149}, (_, index) => ({
  id:'thread-'+String(index+1).padStart(3,'0'),
  ownerId:index === 0 ? account.uid : 'player-'+index,
  title:index === 148 ? 'Older demo request · Westhaven' : 'Conversation '+String(index+1).padStart(3,'0')+' · Training feedback',
  city:index === 148 ? 'westhaven' : 'peterborough',
  category:index === 148 ? 'demo' : index % 2 ? 'map' : 'bug',
  mode:'dispatch',department:'fire',version:'test',status:'new',priority:'normal',
  updatedAt:1000-index,playerMessages:2,developerMessages:1,
  playerRead:0,developerRead:index % 3 === 0 ? 0 : 2,lastMessageId:'message-'+index
}));
const threadListeners = new Map();
let sequence = 0;
const fixture = window.fixture = {loads:[],watches:[],sends:[],updates:[],reads:[]};
const page = (offset, developer) => {
  const source = developer ? rows : rows.filter(row => row.ownerId === account.uid);
  return {rows:source.slice(offset,offset+40),cursor:offset+40,more:offset+40 < source.length};
};
const service = fixture.service = {
  ready:Promise.resolve(),account,id:()=>'fixture-id-'+(++sequence),
  subscribeAccount(fn){fn(account);return ()=>{};},
  ensureGuest:async()=>account,
  watchThreads(fn, onError, options={}){fixture.watches.push(options);fn(page(0,Boolean(options.developer)));return ()=>{};},
  async loadThreads({cursor=0,developer=false}={}){fixture.loads.push({cursor,developer});return page(cursor,developer);},
  watchThread(id, fn){threadListeners.set(id,fn);fn(rows.find(row=>row.id===id));return ()=>threadListeners.delete(id);},
  watchMessages(id,fn){const row=rows.find(row=>row.id===id);fn({rows:[{id:row.lastMessageId,authorId:row.ownerId,authorRole:'player',body:'Please make this training scenario available in the demo.',createdAt:{toMillis:()=>100}}],cursor:null,more:false});return ()=>{};},
  loadMessages:async()=>({rows:[],cursor:null,more:false}),
  watchNotes(id,fn){fn([]);return ()=>{};},
  async markRead(...args){fixture.reads.push(args);},
  async send(payload){fixture.sends.push(payload);},
  async updateThread(id,changes){if(fixture.failStatus)throw new Error("Could not save status. Try again.");fixture.updates.push({id,changes});const row=rows.find(row=>row.id===id);Object.assign(row,changes);threadListeners.get(id)?.(row);},
  addNote:async()=>{}
};
mountFeedback({rootUrl:new URL('/',location.href),config:{enabled:true},service});
</script></body></html>`;

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (pathname === "/tests/fixtures/feedback-inbox-boundary.html") {
    res.setHeader("Content-Type", "text/html");
    return res.end(fixtureHtml);
  }
  const file = path.resolve(root, "." + pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end();
    res.setHeader("Content-Type", ({
      ".js": "text/javascript", ".mjs": "text/javascript",
      ".css": "text/css", ".html": "text/html",
    })[path.extname(file)] || "application/octet-stream");
    res.end(data);
  });
});

async function assertUnclipped(locator, label) {
  assert.equal(await locator.isVisible(), true, `${label} must be visible`);
  const geometry = await locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor), rect = ancestor.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
        left = Math.max(left, rect.left); right = Math.min(right, rect.right);
      }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
        top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom);
      }
      // A modal dialog is in the top layer and escapes document/body clipping.
      if (ancestor.matches("dialog[open]")) break;
    }
    return {x:box.left,y:box.top,right:box.right,bottom:box.bottom,left,top,clipRight:right,clipBottom:bottom};
  });
  assert.ok(geometry.x >= geometry.left - 1 && geometry.y >= geometry.top - 1 &&
    geometry.right <= geometry.clipRight + 1 && geometry.bottom <= geometry.clipBottom + 1,
  `${label} must fit inside its visible scroll area: ${JSON.stringify(geometry)}`);
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => {
    const selectors = ["html", "#ptbo-feedback-dialog", ".fb-body", ".fb-sidebar", ".fb-detail"];
    return selectors.flatMap(selector => [...document.querySelectorAll(selector)]
      .filter(element => element.getBoundingClientRect().width > 0 && element.scrollWidth > element.clientWidth + 1)
      .map(element => ({selector,scrollWidth:element.scrollWidth,clientWidth:element.clientWidth})));
  });
  assert.deepEqual(overflow, [], "the page and visible inbox panes must not overflow horizontally");
}

async function keyboardToggle(page, disclosure, expectedOpen) {
  const summary = disclosure.locator(":scope > summary");
  await summary.focus();
  await page.keyboard.press(expectedOpen ? "Enter" : "Space");
  assert.equal(await disclosure.evaluate(element => element.open), expectedOpen);
  assert.equal(await summary.evaluate(element => element === document.activeElement), true);
}

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    headless:true, executablePath:process.env.CHROME_PATH || undefined, args:["--no-sandbox"],
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const viewport of [{width:338,height:656},{width:390,height:844},{width:1000,height:800}]) {
      const page = await browser.newPage({viewport});
      const errors = [], externalRequests = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => {
        const url = route.request().url();
        if (url.startsWith(base + "/")) return route.continue();
        externalRequests.push(url);
        return route.abort();
      });
      await page.goto(base + "/tests/fixtures/feedback-inbox-boundary.html");
      await page.locator("#ptbo-feedback-entry").click();
      await page.waitForFunction(() => document.querySelector(".fb-queue-summary")?.textContent === "149 of 149 conversations");

      assert.equal(await page.locator("#feedback-heading").textContent(), "Developer inbox");
      assert.equal(await page.locator("#feedback-developer").count(), 0, "developer role must not expose a second inbox toggle");
      assert.equal(await page.locator("#feedback-new").isVisible(), false);
      assert.equal(await page.locator(".fb-thread").count(), 40, "initial DOM rendering must be bounded");
      assert.deepEqual(await page.evaluate(() => fixture.loads), [
        {cursor:40,developer:true},{cursor:80,developer:true},{cursor:120,developer:true},
      ], "search must fetch every underlying service page");
      assert.equal(await page.evaluate(() => fixture.watches.some(options => options.developer === false)), false,
        "developer accounts should only subscribe to their role-derived inbox");

      const search = page.getByRole("searchbox");
      const filters = page.locator("details.fb-inbox-filters");
      const inboxTools = page.locator("details.fb-inbox-tools");
      assert.equal(await filters.evaluate(element => element.open), false);
      assert.equal(await inboxTools.evaluate(element => element.open), false);
      await assertUnclipped(search, "developer search");
      await assertUnclipped(page.locator("#feedback-unread"), "unread toggle");
      await assertUnclipped(page.locator(".fb-thread").first(), "first conversation without scrolling");
      assert.equal(await page.locator(".fb-thread-list").evaluate(element => element.scrollTop), 0);
      await assertNoHorizontalOverflow(page);
      for (const key of ["category","status","city","mode","priority"]) {
        assert.equal(await filters.locator(`[data-filter="${key}"]`).count(), 1);
        assert.equal(await filters.locator(`[data-filter="${key}"]`).isVisible(), false);
      }
      assert.equal(await inboxTools.getByRole("button", {name:"Export all feedback for AI",exact:true}).isVisible(), false);
      assert.equal(await inboxTools.getByRole("button", {name:"Refresh inbox",exact:true}).isVisible(), false);
      if (viewport.width === 338) await page.screenshot({path:"/tmp/pmg-inbox-149-mobile.png"});

      await keyboardToggle(page, filters, true);
      await filters.locator('[data-filter="category"]').selectOption("demo");
      assert.equal(await page.locator(".fb-thread").count(), 1);
      assert.match(await page.locator(".fb-thread").textContent(), /Older demo request/);
      await filters.locator('[data-filter="category"]').selectOption("");
      await keyboardToggle(page, filters, false);
      await keyboardToggle(page, inboxTools, true);
      assert.equal(await inboxTools.getByRole("button", {name:"Refresh inbox",exact:true}).isVisible(), true);
      await keyboardToggle(page, inboxTools, false);
      const unread = page.locator("#feedback-unread");
      assert.equal(await unread.getAttribute("aria-pressed"), "false");
      await unread.click();
      assert.equal(await unread.getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator(".fb-queue-summary").textContent(), "50 of 149 conversations");
      await unread.click();
      assert.equal(await unread.getAttribute("aria-pressed"), "false");

      await page.locator("#feedback-more-results").click();
      assert.equal(await page.locator(".fb-thread").count(), 80, "showing more must add the next bounded batch");
      if (viewport.width < 700) {
        await page.locator('[data-thread-id="thread-035"]').scrollIntoViewIfNeeded();
        const beforeScroll = await page.locator('.fb-thread-list').evaluate(el=>el.scrollTop);
        assert.ok(beforeScroll > 0);
        await page.locator('[data-thread-id="thread-035"]').click();
        await page.locator('.fb-back').click();
        const afterScroll = await page.locator('.fb-thread-list').evaluate(el=>el.scrollTop);
        assert.ok(Math.abs(afterScroll-beforeScroll)<2,`List position lost: ${beforeScroll} -> ${afterScroll}`);
      }
      await search.fill("Older demo");
      assert.equal(await page.locator(".fb-thread").count(), 1, "search must find a row outside the initial rendered and loaded page");
      assert.equal(await page.locator("#feedback-more-results").isVisible(), false);
      assert.equal(await page.locator(".fb-thread").getAttribute("data-thread-id"), "thread-149");
      await search.fill("");
      assert.equal(await page.locator(".fb-thread").count(), 40, "changing search must reset the rendering limit");
      await search.fill("Older demo");
      await page.locator('[data-thread-id="thread-149"]').click();

      assert.equal(await page.locator(".fb-detail").isVisible(), true);
      if (viewport.width < 700) {
        assert.equal(await page.locator(".fb-sidebar").isVisible(), false, "mobile detail must replace the list pane");
        assert.equal(await page.locator(".fb-back").evaluate(el=>document.activeElement===el),true);
      } else {
        assert.equal(await page.locator(".fb-sidebar").isVisible(), true);
      }
      const threadTools = page.locator("details.fb-thread-tools");
      assert.equal(await threadTools.evaluate(element => element.open), false);
      await assertUnclipped(page.locator("#feedback-status"), "conversation status");
      assert.equal(await page.locator("#feedback-priority").isVisible(), false);
      await page.locator("#feedback-send").scrollIntoViewIfNeeded();
      await assertUnclipped(page.locator("#feedback-send"), "reply Send button");
      await assertNoHorizontalOverflow(page);
      if (viewport.width === 338) await page.screenshot({path:"/tmp/pmg-inbox-149-conversation-mobile.png"});
      await keyboardToggle(page, threadTools, true);
      assert.equal(await page.locator("#feedback-priority").isVisible(), true);
      await keyboardToggle(page, threadTools, false);
      await page.evaluate(()=>{fixture.failStatus=true;});
      await page.locator('#feedback-status').selectOption('planned');
      await page.getByText('Could not save status. Try again.',{exact:true}).waitFor();
      assert.equal(await page.locator('.fb-detail .fb-error').innerText(),'Could not save status. Try again.');
      assert.equal(await page.locator('#feedback-status').inputValue(),'new');
      await page.evaluate(()=>{fixture.failStatus=false;});
      await page.locator("#feedback-status").selectOption("reviewing");
      assert.deepEqual(await page.evaluate(() => fixture.updates), [{id:"thread-149",changes:{status:"reviewing"}}]);
      await page.locator("#feedback-reply").fill("We will review this demo request.");
      await page.locator("#feedback-send").click();
      await page.waitForFunction(() => document.querySelector("#feedback-reply")?.value === "");
      const sends = await page.evaluate(() => fixture.sends);
      assert.equal(sends.length, 1);
      assert.equal(sends[0].threadId, "thread-149");
      assert.equal(sends[0].body, "We will review this demo request.");

      if (viewport.width < 700) {
        await page.locator(".fb-back").click();
        assert.equal(await page.locator(".fb-sidebar").isVisible(), true);
        assert.equal(await search.inputValue(), "Older demo");
        assert.equal(await page.locator('[data-thread-id="thread-149"]').evaluate(element => element === document.activeElement), true,
          "returning to the inbox must restore focus to the selected conversation");
      }
      await assertNoHorizontalOverflow(page);
      assert.deepEqual(errors, [], "fixture must have no uncaught browser errors");
      assert.deepEqual(externalRequests, [], "the UI fixture must not request live services");
      console.log(`PASS ${viewport.width}×${viewport.height}: one developer inbox, 149-row search, bounded list, keyboard disclosures, reachable reply, restored focus`);
      await page.close();
    }

    const guest = await browser.newPage({viewport:{width:338,height:656}});
    const guestExternal = [];
    await guest.route("**/*", route => {
      const url = route.request().url();
      if (url.startsWith(base + "/")) return route.continue();
      guestExternal.push(url); return route.abort();
    });
    await guest.goto(base + "/tests/fixtures/feedback-inbox-boundary.html?guest=1");
    await guest.locator("#ptbo-feedback-entry").click();
    await guest.locator(".fb-thread").waitFor();
    assert.equal(await guest.locator("#feedback-heading").textContent(), "Feedback & messages");
    await assertUnclipped(guest.locator("#feedback-new"), "guest New message action");
    assert.equal(await guest.locator("#feedback-developer, .fb-inbox-filters, .fb-inbox-tools, #feedback-unread").count(), 0);
    assert.equal(await guest.locator(".fb-thread").count(), 1);
    assert.deepEqual(await guest.evaluate(() => fixture.loads), []);
    await guest.locator("#feedback-new").click();
    assert.equal(await guest.locator("#feedback-title").isVisible(), true);
    assert.equal(await guest.locator("#feedback-create-thread").isVisible(), true);
    await assertNoHorizontalOverflow(guest);
    assert.deepEqual(guestExternal, []);
    console.log("PASS guest: player heading and New message retained, developer controls absent");
    await guest.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
  server.close();
});
