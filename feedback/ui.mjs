import { createDemoRequests } from './demo-requests.mjs?v=demo-feedback-20261028';
import { editorUrlForReport, exportFeedback } from "./agent-tools.mjs?v=feedback-workflow-20261028";
import { feedbackConfig } from "./config.mjs?v=feedback-workflow-20261028";
import { createFeedbackService } from "./service.mjs?v=demo-feedback-20261028";
import { normalizeLocationReport, locationReportIdentity, locationReportGroupKey } from './location-report.mjs';
import { mountLocationReportComposer, mountLocationReportDetails } from './location-report-ui.mjs?v=compact-feedback-20261028';
import {
  categories,
  statuses,
  priorities,
  normalizeNewThread,
  errorMessage,
  filterThreads,
  unreadCount,
} from "./model.mjs?v=demo-feedback-20261028";

const node = (tag, text, attrs = {}) => {
  const element = document.createElement(tag);
  if (text !== null) element.textContent = text;
  for (const [name, value] of Object.entries(attrs))
    element.setAttribute(name, value);
  return element;
};
const options = (values) =>
  Object.entries(values).map(([value, label]) =>
    node("option", label, { value }),
  );

export function mountFeedback({
  rootUrl = new URL("../", import.meta.url),
  config = feedbackConfig,
  service,
  reportMapLoader,
} = {}) {
  if (
    window.top !== window ||
    !config.enabled ||
    /\/(?:legal|dispatch-editor|site-stats)\//.test(location.pathname)
  )
    return null;
  if (window.PTBO_FEEDBACK) return window.PTBO_FEEDBACK;
  service ||= createFeedbackService(config);
  const stylesheet = node("link", null, {
    rel: "stylesheet",
    href: new URL("feedback/styles.css?v=demo-feedback-20261028", rootUrl),
  });
  document.head.append(stylesheet);
  const dialog = node("dialog", null, {
    id: "ptbo-feedback-dialog",
    "aria-labelledby": "feedback-heading",
  });
  dialog.innerHTML = `<header class="fb-header"><div class="fb-heading"><h2 id="feedback-heading">Feedback & messages</h2><div class="fb-identity"></div></div><button id="feedback-account" type="button">Account</button><button id="feedback-close" type="button" aria-label="Close feedback">✕</button></header><div class="fb-body"></div>`;
  document.body.append(dialog);
  const body = dialog.querySelector(".fb-body"),
    identity = dialog.querySelector(".fb-identity");
  let current = null,
    developer = false,
    selected = null,
    view = "welcome",
    stops = [],
    threadStop;
  let threads = new Map(),
    messages = new Map(),
    threadPage,
    messagePage,
    generation = 0,
    listGeneration = 0,
    overflow = "";
  const demoRequests = createDemoRequests(service, context);
  const entries = new Set(),
    filters = {},
    drafts = new Map();
  let threadsPaginated = false,
    messagesPaginated = false;
  let reportView = null, openRequest = 0;
  let queueStop, queueGeneration = 0, queueLoading = false, queueComplete = false, queueError = "";
  const developerQueue = new Map();
  let readScheduled = false, readAttempt = "";
  function scheduleRead() {
    if (readScheduled) return;
    readScheduled = true;
    const nextFrame = window.requestAnimationFrame?.bind(window) || (fn => window.setTimeout(fn,0));
    nextFrame(() => { readScheduled = false; acknowledgeVisibleMessages(); });
  }
  function acknowledgeVisibleMessages() {
    const list = $(".fb-messages"), detail = $(".fb-detail"), last = list?.lastElementChild;
    if (!current || !selected || !dialog.open || view !== "inbox" || document.visibilityState !== "visible" || !document.hasFocus() || !last?.matches(".fb-message")) return;
    const latest = [...messages.values()].sort((a,b)=>(a.createdAt?.toMillis?.() || 0)-(b.createdAt?.toMillis?.() || 0)).at(-1);
    if (!latest || latest.id !== selected.lastMessageId || last.dataset.messageId !== latest.id) return;
    const box = last.getBoundingClientRect(), area = list.getBoundingClientRect(), pane = detail.getBoundingClientRect();
    if (box.height <= 0 || box.bottom > Math.min(area.bottom, pane.bottom, window.innerHeight) + 1 || box.bottom <= Math.max(area.top, pane.top, 0)) return;
    if (!unreadCount(selected, developer ? "developer" : "player")) return;
    const uid = current.uid, token = generation, id = selected.id, role = developer, messageId = latest.id;
    const attempt = `${uid}:${role}:${id}:${messageId}`;
    if (readAttempt === attempt) return;
    readAttempt = attempt;
    void service.markRead(id, role, messageId).catch(error => {
      if (current?.uid === uid && generation === token) { readAttempt = ""; fail(error); }
    });
  }
  document.addEventListener("visibilitychange", scheduleRead);
  window.addEventListener("focus", scheduleRead);
  dialog.addEventListener("scroll", scheduleRead, true);
  const reportDrafts = new Map();
  const $ = (selector) => dialog.querySelector(selector);
  const clearDetail = () => {
    reportView?.destroy();
    reportView = null;
    ++generation;
    for (const stop of stops) stop();
    stops = [];
    messages.clear();
    messagePage = null;
    messagesPaginated = false;
    selected = null;
    dialog.dataset.threadOpen = "false";
  };
  const fail = (error, target = $(".fb-error")) => {
    if (target) target.textContent = errorMessage(error);
  };
  const draftKey = () => `${current?.uid}:${selected?.id || "new"}`;
  const draftRecord = (key = draftKey()) => {
    if (!drafts.has(key))
      drafts.set(key, {
        body: "",
        messageId: service.id(),
        threadId: selected?.id || service.id(),
        input: {},
      });
    return drafts.get(key);
  };
  const draft = () => draftRecord().body;
  const saveDraft = (value) => {
    const record = draftRecord();
    if (record.body !== value) record.messageId = service.id();
    record.body = value;
  };

  function setUnread() {
    const unread = [...(current?.isDeveloper ? developerQueue : threads).values()].some(
      (t) => unreadCount(t, current?.isDeveloper ? "developer" : "player") > 0,
    );
    for (const entry of entries) {
      entry.dataset.unread = String(unread);
      entry.setAttribute(
        "aria-label",
        unread ? "Feedback: unread messages" : "Feedback",
      );
    }
  }
  function receiveThreads(page) {
    if (!threadsPaginated) threadPage = page;
    for (const row of page.rows) threads.set(row.id, row);
    if (selected && threads.has(selected.id)) selected = threads.get(selected.id);
    updateDetailHeader(); renderList(); setUnread(); scheduleRead();
  }
  function startDeveloperQueue() {
    const token = ++queueGeneration, uid = current?.uid;
    queueStop?.(); developerQueue.clear(); queueComplete = false; queueLoading = true; queueError = "";
    if (!current?.isDeveloper) { queueLoading = false; return; }
    const valid = () => token === queueGeneration && current?.uid === uid && current?.isDeveloper;
    let scanning = false;
    const changed = () => {
      if (developer) { threads = new Map(developerQueue); receiveThreads({rows:[],more:false}); }
      else setUnread();
    };
    queueStop = service.watchThreads(page => {
      if (!valid()) return;
      for (const row of page.rows) developerQueue.set(row.id, row);
      changed();
      if (scanning || queueComplete) return;
      scanning = true;
      void (async () => {
        try {
          while (page.more) {
            page = await service.loadThreads({developer:true,cursor:page.cursor});
            if (!valid()) return;
            for (const row of page.rows) developerQueue.set(row.id,row);
            changed();
          }
          queueComplete = true;
        } catch(error) { if (valid()) queueError = errorMessage(error); }
        finally { if (valid()) { scanning = false; queueLoading = false; changed(); } }
      })();
    }, error => { if (valid()) { queueError = errorMessage(error); queueLoading = false; changed(); } }, {developer:true});
  }
  function startThreads() {
    const listToken = ++listGeneration;
    threadStop?.(); threadStop = null; threads = new Map(); threadPage = null; threadsPaginated = false;
    setUnread();
    if (!current) return;
    if (developer) { threads = new Map(developerQueue); receiveThreads({rows:[],more:false}); return; }
    threadStop = service.watchThreads(page => { if (listToken === listGeneration) receiveThreads(page); }, fail, {developer:false});
  }
  function updateDetailHeader() {
    const header = $(".fb-detail-header");
    if (!selected || !header) return;
    header.querySelector("small").textContent =
      `${selected.city} · ${selected.mode} · ${selected.department} · v${selected.version} · ${statuses[selected.status] || selected.status}`;
    for (const key of ["status", "priority"]) {
      const select = $(`#feedback-${key}`);
      if (select && !select.disabled) select.value = selected[key];
    }
  }
  function renderList() {
    const list = $(".fb-thread-list");
    if (!list) return;
    const rows = filterThreads(
      [...threads.values()],
      filters,
      current?.uid,
      developer,
    ).filter(thread => {
      if (!developer || !filters.reportGroup) return true;
      try { return thread.locationReport && locationReportGroupKey(thread.locationReport) === filters.reportGroup; }
      catch { return false; }
    });
    list.replaceChildren();
    const cities = $('[data-filter="city"]');
    if (cities) {
      const known = new Set([...cities.options].map(option=>option.value));
      for (const city of [...new Set([...developerQueue.values()].map(t=>t.city))].sort())
        if (!known.has(city)) cities.append(node("option",city.replaceAll('-',' '),{value:city}));
    }
    const summary = $(".fb-queue-summary");
    if (summary) summary.textContent = queueError ? `Search incomplete: ${queueError}` : queueLoading ? `${rows.length} matches · searching all conversations (${threads.size} loaded)…` : `${rows.length} matches · all ${threads.size} conversations searched`;
    if (!rows.length)
      list.append(
        node("p", "No matching conversations.", {
          class: "fb-empty",
        }),
      );
    for (const thread of rows) {
      const button = node("button", null, {
        type: "button",
        class: "fb-thread",
        "data-thread-id": thread.id,
        "data-unread": String(
          unreadCount(thread, developer ? "developer" : "player") > 0,
        ),
        "aria-current": String(selected?.id === thread.id),
      });
      button.append(
        node("strong", thread.title),
        node(
          "small",
          `${thread.city} · ${thread.mode} · ${statuses[thread.status] || thread.status}${developer && thread.ownerId === current?.uid ? " · You" : ""}`,
        ),
      );
      button.onclick = () => openThread(thread);
      list.append(button);
    }
    const more = $("#feedback-more-threads");
    if (more) more.hidden = !threadPage?.more;
  }
  function accountView(mode = "welcome") {
    clearDetail();
    view = "account";
    body.replaceChildren();
    const panel = node("section", null, { class: "fb-welcome fb-stack" });
    panel.append(
      node(
        "h3",
        mode === "register"
          ? "Create your account"
          : mode === "signin"
            ? "Welcome back"
            : "Your private inbox",
      ),
      node("p", "Send feedback, ask a question, and read developer replies.", {
        class: "fb-muted",
      }),
    );
    if (mode === "welcome") {
      if (current && !current.isGuest) {
        panel.append(node("p", current.email, { class: "fb-muted" }));
        const signout = node("button", "Sign out", {
          id: "feedback-signout",
          type: "button",
        });
        signout.onclick = async () => {
          signout.disabled = true;
          try {
            await service.signOut();
          } catch (error) {
            fail(error);
          } finally {
            if (signout.isConnected) signout.disabled = false;
          }
        };
        panel.append(signout);
      } else {
        for (const [id, label, next] of [
          ["feedback-signin", "Sign in", "signin"],
          ["feedback-create", "Create account", "register"],
        ]) {
          const button = node("button", label, {
            id,
            type: "button",
            class: next === "register" ? "fb-primary" : "",
          });
          button.onclick = () => accountView(next);
          panel.append(button);
        }
      }
      const guest = node(
        "button",
        current && !current.isGuest ? "Back to messages" : "Continue as guest",
        { id: "feedback-guest", type: "button" },
      );
      guest.onclick = () => {
        rememberWelcome();
        close();
      };
      panel.append(guest);
      if (current) {
        const inbox = node("button", "My conversations", { type: "button" });
        inbox.onclick = () => showInbox();
        panel.append(inbox);
      }
    } else {
      const form = node("form", null, {
        id: "feedback-auth-form",
        class: "fb-stack",
      });
      form.innerHTML = `<label>Email<input id="feedback-email" type="email" autocomplete="email" required maxlength="254"></label><label>Password<input id="feedback-password" type="password" autocomplete="${mode === "register" ? "new-password" : "current-password"}" required minlength="${mode === "register" ? 8 : 1}" maxlength="128"></label><p class="fb-error" role="status" aria-live="polite"></p><button id="feedback-auth-submit" class="fb-primary" type="submit">${mode === "register" ? "Create account" : "Sign in"}</button>`;
      form.onsubmit = async (event) => {
        event.preventDefault();
        const button = form.querySelector("button");
        button.disabled = true;
        try {
          await service[mode === "register" ? "register" : "signIn"](
            $("#feedback-email").value,
            $("#feedback-password").value,
          );
          rememberWelcome();
          showInbox();
        } catch (error) {
          fail(error, form.querySelector(".fb-error"));
        } finally {
          if (button.isConnected) button.disabled = false;
        }
      };
      panel.append(form);
      if (mode === "signin" && current?.isGuest) panel.append(node("p","Signing in keeps this guest’s conversations in your account.",{class:"fb-muted"}));
      if (mode === "signin") {
        const reset = node("button", "Reset password", {
          id: "feedback-reset",
          type: "button",
        });
        reset.onclick = async () => {
          const email = $("#feedback-email");
          if (!email.reportValidity()) return;
          reset.disabled = true;
          try {
            await service.resetPassword(email.value);
            form.querySelector(".fb-error").textContent =
              "If this email can receive a reset link, it will arrive shortly.";
          } catch (error) {
            fail(error, form.querySelector(".fb-error"));
          } finally {
            reset.disabled = false;
          }
        };
        panel.append(reset);
      }
      const back = node("button", "Back", { type: "button" });
      back.onclick = () => accountView();
      panel.append(back);
    }
    if (!panel.querySelector(".fb-error"))
      panel.append(
        node("p", "", {
          class: "fb-error",
          role: "status",
          "aria-live": "polite",
        }),
      );
    body.append(panel);
  }
  function rememberWelcome() {
    try {
      sessionStorage.setItem("ptbo-feedback-welcome", "1");
    } catch {}
  }
  function showInbox() {
    ++openRequest;
    if (!current) {
      accountView();
      return;
    }
    clearDetail();
    view = "inbox";
    body.innerHTML = `<aside class="fb-sidebar"><div class="fb-tools"><button id="feedback-new" class="fb-primary" type="button">New message</button><div id="feedback-developer-controls"></div><p class="fb-error" role="status" aria-live="polite"></p></div><p class="fb-queue-summary fb-muted" role="status"></p><div class="fb-thread-list"></div><button id="feedback-more-threads" type="button" hidden>Load more conversations</button></aside><section class="fb-detail"><p class="fb-empty">Choose a conversation or start a new message.</p></section>`;
    $(".fb-queue-summary").hidden = !developer;
    $("#feedback-new").onclick = newThread;
    if (service.transferError) {
      const pending = node("p","Some guest conversations are still being recovered.",{class:"fb-muted"});
      const retry = node("button","Retry conversation recovery",{type:"button"});
      retry.onclick = async () => { retry.disabled = true; try { await service.recoverConversations(); showInbox(); } catch(error) { fail(error); } finally { if(retry.isConnected) retry.disabled=false; } };
      $(".fb-tools").append(pending,retry);
    }
    if (current.isDeveloper) {
      const toggle = node(
        "button",
        developer ? "My conversations" : "Developer inbox",
        { id: "feedback-developer", type: "button" },
      );
      toggle.onclick = () => {
        developer = !developer;
        Object.keys(filters).forEach((k) => delete filters[k]);
        startThreads();
        showInbox();
      };
      $("#feedback-developer-controls").append(toggle);
      if (developer) buildFilters();
      else $(".fb-queue-summary").hidden = true;
    }
    $("#feedback-more-threads").onclick = async (event) => {
      const button = event.currentTarget,
        token = listGeneration,
        uid = current.uid;
      button.disabled = true;
      try {
        const page = await service.loadThreads({
          developer,
          cursor: threadPage.cursor,
        });
        if (token !== listGeneration || current?.uid !== uid) return;
        threadsPaginated = true;
        threadPage = page;
        page.rows.forEach((row) => threads.set(row.id, row));
        renderList();
      } catch (error) {
        fail(error);
      } finally {
        button.disabled = false;
      }
    };
    renderList();
  }
  function exportButton(label, getThreads) {
    const button = node("button", label, {type:"button"});
    button.onclick = async () => {
      const uid = current?.uid;
      button.disabled = true;
      try {
        if (!current?.isDeveloper) throw new Error("Developer access is required.");
        const rows = getThreads();
        const data = await exportFeedback(service, rows, rootUrl);
        if (current?.uid !== uid || !current?.isDeveloper) return;
        const blob = new Blob([JSON.stringify(data, (key,value)=>value?.toDate?.()?.toISOString() ?? value, 2)], {type:"application/json"});
        const url = URL.createObjectURL(blob), link = node("a", null, {href:url,download:`game-feedback-${new Date().toISOString().slice(0,10)}.json`});
        document.body.append(link); link.click(); link.remove();
        window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      } catch(error) { if (current?.uid === uid) fail(error); }
      finally { if (button.isConnected) button.disabled = false; }
    };
    return button;
  }
  function buildFilters() {
    const controls = $("#feedback-developer-controls");
    controls.append(exportButton("Export all feedback for AI", () => {
      if (!queueComplete) throw new Error("Wait for all conversations to finish loading, then export again.");
      return [...developerQueue.values()];
    }));
    const retry = node("button", "Refresh inbox", {type:"button"});
    retry.onclick = () => startDeveloperQueue(); controls.append(retry);
    if (filters.reportGroup) {
      const clear = node('button', 'Showing similar reports · Clear', {type:'button'});
      clear.onclick = () => { delete filters.reportGroup; showInbox(); };
      controls.append(clear);
    }
    const search = node("input", null, {
      type: "search",
      placeholder: "Search titles, locations and IDs",
      "aria-label": "Search titles, locations and IDs",
    });
    search.value = filters.search || "";
    search.oninput = () => {
      filters.search = search.value;
      renderList();
    };
    controls.append(search);
    const group = node("div", null, { class: "fb-filters" });
    for (const [key, label, values] of [
      ["city", "City", {}],
      [
        "mode",
        "Mode",
        {
          dispatch: "Dispatch",
          geo: "Geo Guesser",
          route: "Route Mapping",
          explorer: "City Explorer",
          general: "General",
        },
      ],
      ["category", "Category", categories],
      ["status", "Status", statuses],
      ["priority", "Priority", priorities],
    ]) {
      const labelNode = node("label", label),
        input = node(values ? "select" : "input", null, {
          "aria-label": label,
        });
      if (values)
        input.append(node("option", "All", { value: "" }), ...options(values));
      else input.placeholder = "All cities";
      input.dataset.filter = key;
      if (key === "city") input.append(...options(Object.fromEntries([...new Set([...developerQueue.values()].map(t=>t.city))].sort().map(city=>[city,city.replaceAll('-',' ')]))));
      input.value = filters[key] || "";
      input.oninput = () => {
        filters[key] = input.value.trim();
        renderList();
      };
      labelNode.append(input);
      group.append(labelNode);
    }
    controls.append(group);
    const unread = node("label", "Unread only", { class: "fb-check" }),
      check = node("input", null, { type: "checkbox" });
    check.checked = Boolean(filters.unread);
    check.onchange = () => {
      filters.unread = check.checked;
      renderList();
    };
    unread.prepend(check);
    controls.append(unread);
  }
  function context() {
    let game = window;
    try {
      game =
        document.querySelector("#simulator, #game-frame")?.contentWindow ||
        window;
    } catch {}
    const city =
      document.querySelector("#home-city-select")?.value ||
      new URLSearchParams(location.search).get("city") ||
      game.PTBO_CITY_PACKAGE?.id ||
      "peterborough";
    const mode = location.pathname.includes("response-simulator")
      ? "dispatch"
      : location.pathname.includes("geo-guesser")
        ? "geo"
        : location.pathname.includes("route-mapping")
          ? "route"
          : location.pathname.includes("city-explorer")
            ? "explorer"
            : "general";
    const department =
      game.document?.querySelector("#service-select")?.value ||
      (game.document?.querySelector(
        '#service-ems[aria-pressed="true"], #picker-ems[aria-pressed="true"]',
      ) &&
        "ems") ||
      new URLSearchParams(location.search).get("service") ||
      "fire";
    return {
      city,
      mode,
      department,
      version: window.PTBO_BUILD?.version || "unknown",
    };
  }
  function newThread() {
    clearDetail();
    view = "new";
    body.replaceChildren();
    const info = context(),
      record = draftRecord(),
      key = draftKey(),
      token = generation;
    const form = node("form", null, { class: "fb-new-form fb-stack" });
    form.innerHTML = `<h3>New message</h3><label>Topic<input id="feedback-title" maxlength="120" required placeholder="A short description"></label><label>Category<select id="feedback-category"></select></label><label>Message<textarea id="feedback-body" required maxlength="4000" rows="5" placeholder="What happened, or what would you like to see?"></textarea></label><details class="fb-message-context"><summary>Game details · included automatically</summary><div class="fb-context fb-auto-context-body"><label>City<input id="feedback-city" maxlength="80" required></label><label>Mode<select id="feedback-mode"></select></label><label>Department<select id="feedback-department"><option value="fire">Fire</option><option value="ems">EMS</option><option value="general">General</option></select></label></div></details><p class="fb-error" role="status" aria-live="polite"></p><div class="fb-actions"><button type="button" id="feedback-cancel-new">Back</button><button type="submit" id="feedback-create-thread" class="fb-primary">Send message</button></div>`;
    form.addEventListener("invalid", event => {
      const details = event.target.closest("details");
      if (details) details.open = true;
    }, true);
    form.querySelector("#feedback-category").append(...options(categories));
    form
      .querySelector("#feedback-mode")
      .append(
        ...options({
          general: "General",
          dispatch: "Dispatch",
          geo: "Geo Guesser",
          route: "Route Mapping",
          explorer: "City Explorer",
        }),
      );
    for (const field of ["city", "mode", "department"])
      form.querySelector(`#feedback-${field}`).value =
        record.input[field] || info[field];
    for (const field of ["title", "category"])
      if (record.input[field])
        form.querySelector(`#feedback-${field}`).value = record.input[field];
    form.querySelector("#feedback-body").value = draft();
    form.oninput = () => {
      saveDraft(form.querySelector("#feedback-body").value);
      for (const field of ["title", "category", "city", "mode", "department"])
        record.input[field] = form.querySelector(`#feedback-${field}`).value;
    };
    const { threadId } = record,
      uid = current.uid;
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = form.querySelector("#feedback-create-thread"),
        messageId = record.messageId;
      button.disabled = true;
      try {
        const value = normalizeNewThread(
          {
            title: form.querySelector("#feedback-title").value,
            body: form.querySelector("#feedback-body").value,
            category: form.querySelector("#feedback-category").value,
            city: form.querySelector("#feedback-city").value,
            mode: form.querySelector("#feedback-mode").value,
            department: form.querySelector("#feedback-department").value,
          },
          info,
        );
        await service.send({
          threadId,
          messageId,
          body: value.body,
          newThread: value,
        });
        if (current?.uid !== uid) return;
        if (drafts.get(key)?.messageId === messageId) drafts.delete(key);
        if (token !== generation || !dialog.open) return;
        showInbox();
        openThread({
          id: threadId,
          ...value,
          status: "new",
          priority: "normal",
        });
      } catch (error) {
        fail(error, form.querySelector(".fb-error"));
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    };
    form.querySelector("#feedback-cancel-new").onclick = showInbox;
    body.append(form);
  }
  function openThread(thread) {
    clearDetail();
    selected = thread;
    view = "inbox";
    dialog.dataset.threadOpen = "true";
    const token = ++generation;
    const detail = $(".fb-detail");
    if (!detail) return;
    detail.innerHTML = `<header class="fb-detail-header"><button type="button" class="fb-back">← Conversations</button><h3></h3><small class="fb-muted"></small><div class="fb-admin-status fb-actions"></div></header><div class="fb-messages" aria-label="Conversation messages"></div><div class="fb-notes" hidden></div><form class="fb-compose"><label>Reply<textarea id="feedback-reply" maxlength="4000" required rows="2" placeholder="Write a reply…"></textarea></label><p class="fb-error" role="status" aria-live="polite"></p><div class="fb-actions"><small class="fb-muted">Private conversation with the developer</small><button id="feedback-send" class="fb-primary" type="submit">Send</button></div></form>`;
    detail.querySelector("h3").textContent = thread.title;
    detail.querySelector(".fb-detail-header small").textContent =
      `${thread.city} · ${thread.mode} · ${thread.department} · v${thread.version} · ${statuses[thread.status] || thread.status}`;
    if (developer) detail.querySelector('.fb-detail-header').append(node('div',
      thread.ownerId === current?.uid ? 'Sender: You (your account)' : `Player ID: ${thread.ownerId}`,
      {class:'fb-muted fb-sender'}));
    detail.querySelector(".fb-back").onclick = () => {
      clearDetail();
      renderList();
    };
    const reply = $("#feedback-reply"),
      key = draftKey();
    reply.value = draft();
    reply.oninput = () => saveDraft(reply.value);
    detail.querySelector(".fb-compose").onsubmit = async (event) => {
      event.preventDefault();
      const send = detail.querySelector("#feedback-send"),
        uid = current.uid,
        bodyText = reply.value,
        messageId = draftRecord(key).messageId;
      send.disabled = true;
      reply.disabled = true;
      try {
        await service.send({ threadId: thread.id, messageId, body: bodyText });
        if (current?.uid !== uid) return;
        if (drafts.get(key)?.messageId === messageId) drafts.delete(key);
        if (token !== generation) return;
        reply.value = "";
        detail.querySelector(".fb-error").textContent = "";
      } catch (error) {
        if (current?.uid === uid)
          fail(error, detail.querySelector(".fb-error"));
      } finally {
        if (send.isConnected) send.disabled = false;
        if (reply.isConnected) reply.disabled = false;
      }
    };
    if (thread.locationReport) {
      try { reportView = mountLocationReportDetails({host:detail.querySelector('.fb-detail-header'),report:thread.locationReport,rootUrl,mapLoader:reportMapLoader}); }
      catch { detail.querySelector('.fb-detail-header').append(node('p','The attached location report could not be displayed.',{class:'fb-error'})); }
    }
    if (developer) buildAdminThread(thread, detail, token);
    // Older queue pages are fetched once. Keep the selected document live even
    // when it is outside the top-40 subscription (read/status do not reorder it).
    if (service.watchThread) stops.push(service.watchThread(thread.id,row=>{
      if (token !== generation || selected?.id !== thread.id) return;
      if (!row) { threads.delete(thread.id); developerQueue.delete(thread.id); showInbox(); return; }
      selected = row; threads.set(row.id,row);
      if (current?.isDeveloper) developerQueue.set(row.id,row);
      updateDetailHeader(); renderList(); setUnread(); scheduleRead();
    },error=>{
      if (token !== generation) return;
      if (error?.code === "permission-denied") { threads.delete(thread.id); developerQueue.delete(thread.id); showInbox(); setUnread(); }
      fail(error);
    }));
    stops.push(
      service.watchMessages(
        thread.id,
        (page) => {
          if (token !== generation || selected?.id !== thread.id) return;
          if (!messagesPaginated) messagePage = page;
          page.rows.forEach((row) => messages.set(row.id, row));
          renderMessages();
          scheduleRead();
        },
        fail,
      ),
    );
    renderList();
  }
  function renderMessages() {
    const list = $(".fb-messages");
    if (!list) return;
    const nearBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight < 90;
    list.replaceChildren();
    if (messagePage?.more) {
      const older = node("button", "Earlier messages", { type: "button" });
      older.onclick = async () => {
        const token = generation,
          id = selected.id,
          uid = current.uid;
        older.disabled = true;
        try {
          const page = await service.loadMessages(id, messagePage.cursor);
          if (
            token !== generation ||
            selected?.id !== id ||
            current?.uid !== uid
          )
            return;
          messagesPaginated = true;
          messagePage = page;
          page.rows.forEach((row) => messages.set(row.id, row));
          renderMessages();
        } catch (error) {
          fail(error);
        } finally {
          older.disabled = false;
        }
      };
      list.append(older);
    }
    const rows = [...messages.values()].sort(
      (a, b) =>
        (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0),
    );
    for (const message of rows) {
      const bubble = node("article", null, {
        class: "fb-message",
        "data-message-id": message.id,
        "data-role": message.authorRole,
      });
      bubble.append(
        node(
          "small",
          message.authorId === current?.uid ? "You" : message.authorRole === "developer" ? "Developer" : "Player",
        ),
        node("span", message.body),
      );
      const milliseconds = message.createdAt?.toMillis?.();
      if (Number.isFinite(milliseconds)) {
        const date = new Date(milliseconds);
        bubble.append(node('time', date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}), {datetime:date.toISOString(),class:'fb-muted'}));
      }
      list.append(bubble);
    }
    if (nearBottom || rows.length <= 2) list.scrollTop = list.scrollHeight;
    scheduleRead();
  }
  function buildAdminThread(thread, detail, token) {
    detail.querySelector('.fb-admin-status').append(exportButton("Export conversation for AI",()=>[selected]));
    const fix = node("form",null,{class:"fb-fix-record fb-actions"});
    fix.innerHTML = '<label>Published fix version<input name="fix-version" placeholder="1.6.146" required pattern="[0-9]+\\.[0-9]+\\.[0-9]+" maxlength="30"></label><button type="submit">Record published fix</button><span class="fb-fix-result" role="status"></span>';
    fix.onsubmit = async event => {
      event.preventDefault(); const button=fix.querySelector("button"), uid=current?.uid;
      button.disabled=true;
      try {
        const version=fix.querySelector("input").value.trim();
        if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Enter the published version, such as 1.6.146.");
        await service.addNote(thread.id,`Fixed in version ${version}. Published fix recorded by the developer.`,service.id());
        if (current?.uid===uid && token===generation) fix.querySelector('.fb-fix-result').textContent=`Recorded v${version}. Set the status to Resolved after verifying the fix.`;
      } catch(error) { if(current?.uid===uid && token===generation) fail(error); }
      finally { if(button.isConnected)button.disabled=false; }
    };
    const fixSection=node("details",null,{class:"fb-fix-section"});
    fixSection.append(node("summary","Record a published fix"),fix);
    detail.querySelector('.fb-admin-status').append(fixSection);
    if (thread.locationReport) {
      const editor = node("a", "Open in editor", {href:editorUrlForReport(thread.locationReport,rootUrl,thread.id),target:"_blank",rel:"noopener",class:"fb-editor-link"});
      editor.onclick = event => {
        if (!current?.isDeveloper) { event.preventDefault(); return; }
        try { localStorage.setItem("ptbo-emergency-developer-mode","enabled"); }
        catch { event.preventDefault(); fail(new Error("Enable developer editing on this device to open the editor.")); }
      };
      detail.querySelector('.fb-admin-status').append(editor);
      const related = node('button','Find similar reports',{type:'button'});
      related.onclick = () => { filters.reportGroup = locationReportGroupKey(thread.locationReport); showInbox(); };
      detail.querySelector('.fb-admin-status').append(related);
    }
    for (const [key, values] of [
      ["status", statuses],
      ["priority", priorities],
    ]) {
      const label = node("label", key === "status" ? "Status" : "Priority"),
        select = node("select", null, { id: `feedback-${key}` });
      select.append(...options(values));
      select.value = thread[key];
      select.onchange = async () => {
        select.disabled = true;
        try {
          await service.updateThread(thread.id, { [key]: select.value });
        } catch (error) {
          fail(error);
          select.value = thread[key];
        } finally {
          select.disabled = false;
        }
      };
      label.append(select);
      detail.querySelector(".fb-admin-status").append(label);
    }
    const notes = detail.querySelector(".fb-notes");
    notes.hidden = false;
    notes.innerHTML =
      '<details><summary>Private developer notes</summary><div class="fb-note-list"></div><label>Note<textarea id="feedback-note" maxlength="4000" rows="2"></textarea></label><button id="feedback-add-note" type="button">Add private note</button></details>';
    let noteId = service.id();
    notes.querySelector("textarea").oninput = () => {
      noteId = service.id();
    };
    notes.querySelector("button").onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await service.addNote(thread.id, $("#feedback-note").value, noteId);
        if (button.isConnected) {
          $("#feedback-note").value = "";
          noteId = service.id();
        }
      } catch (error) {
        fail(error);
      } finally {
        button.disabled = false;
      }
    };
    stops.push(
      service.watchNotes(
        thread.id,
        (rows) => {
          if (token !== generation) return;
          const list = notes.querySelector(".fb-note-list");
          list.replaceChildren(
            ...rows.map((row) => node("div", row.body, { class: "fb-note" })),
          );
        },
        fail,
      ),
    );
  }
  function installMenu(doc) {
    const reportButton = doc.getElementById('location-report-button');
    if (reportButton && !reportButton.dataset.feedbackReportInstalled) {
      reportButton.dataset.feedbackReportInstalled = 'true';
      reportButton.hidden = false;
      reportButton.onclick = () => {
        const game = doc.defaultView;
        const snapshot = game.PTBO_GEO?.state.review?.reportSnapshot;
        let mapSpec;
        try { mapSpec = game.PTBO_GEO_MAP_PROVIDER?.streetSpec(); } catch {}
        void openLocationReport(snapshot,{mapSpec,clientContext:{browser:game.navigator.userAgent,width:game.innerWidth,height:game.innerHeight}});
      };
    }
    if (doc.getElementById("ptbo-feedback-entry")) return;
    const target = doc.querySelector(
      ".site-header, #control-panel .panel-scroll, #settings .setup, #settings, #settings-form .settings-actions, .control-panel, .station-header, .picker-heading, main > header",
    );
    if (!target) return;
    const button = doc.createElement("button");
    button.id = "ptbo-feedback-entry";
    button.type = "button";
    button.className = "ptbo-feedback-menu-entry";
    button.textContent = "Feedback";
    button.onclick = () => open();
    target.append(button);
    entries.add(button);
    setUnread();
    if (doc !== document) {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = stylesheet.href;
      doc.head.append(link);
    }
  }
  function showDialog() {
    if (!dialog.open) {
      overflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.exitPointerLock?.();
      for (const frame of document.querySelectorAll("iframe")) {
        try {
          frame.contentDocument?.exitPointerLock?.();
          frame.contentWindow?.dispatchEvent(new Event("blur"));
        } catch {}
      }
      window.dispatchEvent(new Event("blur"));
      dialog.showModal();
    }
  }
  async function open({ account: showAccount = false } = {}) {
    const request = ++openRequest;
    showDialog();
    if (showAccount) {
      accountView();
      return;
    }
    body.replaceChildren(
      node("p", "Opening your inbox…", { class: "fb-empty" }),
    );
    try {
      await service.ensureGuest();
      if (dialog.open && request === openRequest) showInbox();
    } catch (error) {
      if (!dialog.open || request !== openRequest) return;
      accountView();
      fail(error);
    }
  }
  async function openLocationReport(snapshot,{mapSpec,clientContext}={}) {
    const request = ++openRequest;
    showDialog();clearDetail();view='report';
    body.replaceChildren(node('p','Opening your location report…',{class:'fb-empty'}));
    try {
      // Geo wrappers own a separate JavaScript realm; transfer data, not its prototypes.
      const copied = JSON.parse(JSON.stringify(snapshot));
      const captured = normalizeLocationReport({schemaVersion:1,kind:'geo-location',reason:'point',snapshot:copied,suggestion:null}).snapshot;
      const priorUid = current?.uid;
      await service.ensureGuest();
      if (!dialog.open || request !== openRequest || (priorUid && current?.uid !== priorUid)) return;
      if (!current) throw new Error('Could not open a private reporting session. Please try again.');
      const uid=current.uid,key=`${uid}:${captured.resultId}`;
      if(!reportDrafts.has(key))reportDrafts.set(key,{});
      const record=reportDrafts.get(key);
      if(!record.diagnostics){
        const device=clientContext||{browser:window.navigator.userAgent,width:window.innerWidth,height:window.innerHeight};
        const browser=String(device.browser||'not recorded').replace(/[\r\n]/g,' ').slice(0,300);
        const viewport=Number.isFinite(device.width)&&device.width>0&&Number.isFinite(device.height)&&device.height>0?`${Math.round(device.width)} × ${Math.round(device.height)} CSS pixels`:'not recorded';
        record.diagnostics=`Browser: ${browser}\nViewport: ${viewport}\nReport opened: ${new Date().toISOString()}`;
      }
      // Initial guest creation may render the account view through its auth callback.
      view='report';
      reportView=mountLocationReportComposer({host:body,snapshot:captured,rootUrl,mapSpec,mapLoader:reportMapLoader,draft:record,diagnosticsText:record.diagnostics,
        onCancel:close,
        async onSend(report,note){
          const message=[note.trim()||'Possible location problem reported from Geo Guesser.',record.diagnostics].join('\n\n');
          const identity=locationReportIdentity(report)+'\n'+message;
          if(record.attempt?.identity!==identity)record.attempt={identity,threadId:service.id(),messageId:service.id(),report,note:message};
          await service.sendLocationReport(record.attempt);
        },
        onReceived(report){
          if(current?.uid!==uid||!dialog.open||view!=='report')return;
          const id=record.attempt.threadId;
          clearDetail();reportDrafts.delete(key);view='report-received';
          const panel=node('section',null,{class:'fb-welcome fb-stack'});
          panel.append(node('h3','Report received'),node('p','The developer can now review the original location and your suggestion.'),node('p',captured.question.name||captured.question.address,{class:'fb-muted'}));
          const conversations=node('button','Open conversation',{type:'button',class:'fb-primary'});
          conversations.onclick=()=>{showInbox();openThread(threads.get(id)||{id,ownerId:uid,title:`Location report · ${captured.question.name||captured.question.address}`,city:captured.city,mode:captured.mode,department:captured.service,version:captured.version,status:'new',priority:'normal',locationReport:report});};
          const done=node('button','Continue playing',{type:'button'});done.onclick=close;
          panel.append(conversations,done);body.replaceChildren(panel);
        },
      });
    } catch(error) {
      if(request!==openRequest||!dialog.open)return;
      const panel=node('section',null,{class:'fb-welcome fb-stack'});
      panel.append(node('h3','Report could not open'),node('p',errorMessage(error),{class:'fb-error',role:'status'}));
      const retry=node('button','Try again',{type:'button'});retry.onclick=()=>void openLocationReport(snapshot,{mapSpec,clientContext});
      const cancel=node('button','Continue playing',{type:'button'});cancel.onclick=close;
      panel.append(retry,cancel);body.replaceChildren(panel);
    }
  }
  function close() {
    ++openRequest;
    ++generation;
    clearDetail();
    dialog.close();
    document.body.style.overflow = overflow;
  }
  dialog.querySelector("#feedback-close").onclick = close;
  dialog.querySelector("#feedback-account").onclick = () => { ++openRequest; accountView(); };
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    rememberWelcome();
    close();
  });
  for (const type of ["keydown", "keyup", "keypress"])
    dialog.addEventListener(type, (event) => event.stopPropagation());
  service.subscribeAccount((next) => {
    const previousUid = current?.uid;
    const changedUid =
      current?.uid !== next?.uid || current?.isDeveloper !== next?.isDeveloper;
    current = next;
    identity.textContent = next
      ? next.isGuest
        ? "Guest"
        : next.email
      : "Sign in or continue as guest";
    if (changedUid) {
      ++generation;
      threadStop?.();
      clearDetail();
      threads.clear();
      drafts.clear();
      reportDrafts.clear();
      demoRequests.reset();
      window.dispatchEvent(new window.CustomEvent("ptbo-feedback-account-change", {detail:{replaced:Boolean(previousUid)}}));
      developer = Boolean(next?.isDeveloper);
      readAttempt = "";
      startDeveloperQueue();
      setUnread();
      if (dialog.open) accountView();
      if (next) startThreads();
    }
  });
  installMenu(document);
  for (const frame of document.querySelectorAll("iframe")) {
    frame.addEventListener("load", () => {
      try {
        installMenu(frame.contentDocument);
      } catch {}
    });
    try {
      if (frame.contentDocument?.readyState === "complete")
        installMenu(frame.contentDocument);
    } catch {}
  }
  async function requestDemo(input) {
    return demoRequests.send(input);
  }
  async function openDemoConversation(city, mode) {
    const thread = demoRequests.status(city, mode).thread;
    if (!thread || thread.ownerId !== current?.uid) throw new Error('Reopen Feedback from your request account.');
    ++openRequest;
    showDialog();
    showInbox();
    openThread(threads.get(thread.id) || thread);
  }
  const api = { open, openLocationReport, close, service, requestDemo,
    demoRequestStatus:demoRequests.status, openDemoConversation };
  window.PTBO_FEEDBACK = api;
  service.ready
    .then(() => {
      const standalone = /\/feedback\/(?:index.html)?$/.test(location.pathname);
      let welcomed = false;
      try {
        welcomed = sessionStorage.getItem("ptbo-feedback-welcome") === "1";
      } catch {}
      const launcher =
        location.pathname === new URL(rootUrl).pathname ||
        location.pathname === new URL("index.html", rootUrl).pathname;
      if (standalone) {
        const category = new URLSearchParams(location.search).get('category');
        if (Object.hasOwn(categories, category)) filters.category = category;
        void open();
      }
      else if (launcher && !current && !welcomed) {
        dialog.showModal();
        overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        accountView();
      }
    })
    .catch(() => {});
  return api;
}
