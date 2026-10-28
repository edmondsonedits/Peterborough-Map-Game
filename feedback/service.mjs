import {signInPreservingGuest,resumeGuestTransfers} from "./guest-transfer.mjs?v=feedback-workflow-20261028";
import { normalizeBody, normalizeNewThread } from "./model.mjs";
import { normalizeLocationReport, locationReportIdentity } from "./location-report.mjs";
const SDK = "https://www.gstatic.com/firebasejs/12.5.0";
export function createFeedbackService(config) {
  let api, appApi, recoveryError = null,
    auth,
    db,
    account = null,
    guestPromise,
    epoch = 0;
  const accountListeners = new Set(),
    subscriptions = new Set();
  const changed = () => accountListeners.forEach((fn) => fn(account));
  const clearSubscriptions = () => {
    for (const stop of [...subscriptions]) stop();
  };
  async function refreshAccount(user) {
    const generation = ++epoch;
    if (account?.uid !== user?.uid) {
      clearSubscriptions();
      account = null;
      changed();
    }
    const claims = user ? await user.getIdTokenResult() : null;
    if (generation !== epoch) return;
    const isDeveloper = claims?.claims.feedbackAdmin === true;
    if (account && account.isDeveloper !== isDeveloper) clearSubscriptions();
    account = user
      ? Object.freeze({
          uid: user.uid,
          email: user.email || "",
          isGuest: user.isAnonymous,
          isDeveloper,
        })
      : null;
    changed();
  }
  const ready = (async () => {
    if (
      !config?.enabled ||
      !config.firebase?.apiKey ||
      !config.firebase.projectId
    )
      throw Object.assign(new Error("Feedback is unavailable right now."), {
        code: "feedback/unavailable",
      });
    if (
      config.emulators &&
      !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
    )
      throw new Error(
        "Local emulator configuration cannot be used on a hosted game.",
      );
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    appApi = appModule;
    api = { ...authModule, ...firestoreModule };
    const app =
      appModule.getApps().find((a) => a.name === "ptbo-feedback") ||
      appModule.initializeApp(config.firebase, "ptbo-feedback");
    if (config.appCheckSiteKey && !config.emulators) {
      const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import(`${SDK}/firebase-app-check.js`);
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(config.appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
    auth = api.getAuth(app);
    db = api.getFirestore(app);
    if (config.emulators) {
      api.connectAuthEmulator(auth, config.emulators.auth, {
        disableWarnings: true,
      });
      api.connectFirestoreEmulator(
        db,
        config.emulators.firestore.host,
        config.emulators.firestore.port,
      );
    }
    await auth.authStateReady();
    await refreshAccount(auth.currentUser);
    api.onIdTokenChanged(auth, (user) => {
      void refreshAccount(user).catch(() => {
        clearSubscriptions();
        account = null;
        changed();
      });
    });
    await recoverTransfers();
  })();
  async function verifyCredentials(email,password) {
    const app = appApi.initializeApp(config.firebase, `ptbo-feedback-verify-${crypto.randomUUID()}`);
    const verificationAuth = api.initializeAuth(app,{persistence:api.inMemoryPersistence});
    if (config.emulators) api.connectAuthEmulator(verificationAuth,config.emulators.auth,{disableWarnings:true});
    try {
      const result = await api.signInWithEmailAndPassword(verificationAuth,email,password);
      return {user:{uid:result.user.uid}};
    } finally {
      await api.signOut(verificationAuth).catch(()=>{});
      await appApi.deleteApp(app);
    }
  }
  async function recoverTransfers() {
    const uid = auth.currentUser?.uid;
    recoveryError = null;
    try { await resumeGuestTransfers({api,auth,db}); }
    catch(error) { if (auth.currentUser?.uid === uid) recoveryError = error; }
    if (auth.currentUser?.uid === uid) changed();
  }
  function requireAccount() {
    if (!account) throw new Error("Open your inbox or sign in first.");
    return account;
  }
  function trackedWatch(q, next, error, transform) {
    const principal = requireAccount();
    const stop = api.onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        if (
          account?.uid !== principal.uid ||
          account?.isDeveloper !== principal.isDeveloper ||
          snap.metadata.hasPendingWrites ||
          snap.metadata.fromCache
        )
          return;
        next(transform(snap));
      },
      error,
    );
    const cleanup = () => {
      stop();
      subscriptions.delete(cleanup);
    };
    subscriptions.add(cleanup);
    return cleanup;
  }
  function threadQuery(developer, cursor) {
    const current = requireAccount();
    if (developer && !current.isDeveloper)
      throw Object.assign(new Error("Developer access is required."), {
        code: "permission-denied",
      });
    return api.query(
      api.collection(db, "feedbackThreads"),
      ...(!developer ? [api.where("ownerId", "==", current.uid)] : []),
      api.orderBy("updatedAt", "desc"),
      ...(cursor ? [api.startAfter(cursor)] : []),
      api.limit(40),
    );
  }
  function page(snap, reverse = false) {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return {
      rows: reverse ? rows.reverse() : rows,
      cursor: snap.docs.at(-1) || null,
      more: snap.size === (reverse ? 100 : 40),
    };
  }
  async function guest() {
    await ready;
    if (auth.currentUser) return account;
    if (!guestPromise)
      guestPromise = api
        .signInAnonymously(auth)
        .then(async (result) => {
          await refreshAccount(result.user);
          return account;
        })
        .finally(() => {
          guestPromise = null;
        });
    return guestPromise;
  }
  async function send({ threadId, messageId, body, newThread }) {
    await ready;
    const current = requireAccount(),
      uid = current.uid;
    body = normalizeBody(body);
    const initial = newThread
      ? normalizeNewThread({ ...newThread, body })
      : null;
    const ref = api.doc(db, "feedbackThreads", threadId),
      messageRef = api.doc(ref, "messages", messageId),
      writer = api.doc(db, "feedbackWriters", uid);
    await api.runTransaction(db, async (tx) => {
      const existing = await tx.get(ref);
      const old = existing.data();
      if (old) {
        if (initial?.locationReport && (!old.locationReport || locationReportIdentity(old.locationReport) !== locationReportIdentity(initial.locationReport)))
          throw new Error("This report ID has already been used for a different report.");
        const prior = await tx.get(messageRef);
        if (prior.exists()) {
          if (prior.data().authorId !== uid || prior.data().body !== body)
            throw new Error("This message has already been used.");
          return;
        }
        if (initial?.locationReport)
          throw new Error("This report ID has already been used. Start a new report to send a different correction.");
      }
      // Firestore rules enforce the cooldown using server time.
      const role = old && current.isDeveloper ? "developer" : "player";
      if (!old) {
        if (!initial) throw new Error("This conversation is unavailable.");
        const { body: _, ...metadata } = initial;
        tx.set(ref, {
          ...metadata,
          ownerId: uid,
          status: "new",
          priority: "normal",
          createdAt: api.serverTimestamp(),
          updatedAt: api.serverTimestamp(),
          lastMessageId: messageId,
          lastSender: role,
          playerMessages: 1,
          developerMessages: 0,
          playerRead: 0,
          developerRead: 0,
        });
      } else
        tx.update(ref, {
          updatedAt: api.serverTimestamp(),
          lastMessageId: messageId,
          lastSender: role,
          [role === "developer" ? "developerMessages" : "playerMessages"]:
            (old[
              role === "developer" ? "developerMessages" : "playerMessages"
            ] || 0) + 1,
        });
      tx.set(writer, { lastSentAt: api.serverTimestamp() });
      tx.set(messageRef, {
        authorId: uid,
        authorRole: role,
        body,
        createdAt: api.serverTimestamp(),
      });
    });
    return threadId;
  }

  return {
    ready,
    get account() { return account; },
    get transferError() { return recoveryError; },
    async recoverConversations() { await ready; await recoverTransfers(); if (recoveryError) throw recoveryError; },
    id() {
      return crypto.randomUUID();
    },
    subscribeAccount(fn) {
      accountListeners.add(fn);
      fn(account);
      return () => accountListeners.delete(fn);
    },
    ensureGuest: guest,
    async register(email, password) {
      await ready;
      if (password.length < 8)
        throw new Error("Choose a password with at least 8 characters.");
      if (guestPromise) await guestPromise;
      const credential = api.EmailAuthProvider.credential(
        email.trim(),
        password,
      );
      // Revoke any interrupted existing-account transfer before linking a new
      // account to this guest UID. This prevents an old destination retaining access.
      if (auth.currentUser?.isAnonymous) await api.deleteDoc(api.doc(db,"feedbackTransfers",auth.currentUser.uid));
      const result = auth.currentUser?.isAnonymous
        ? await api.linkWithCredential(auth.currentUser, credential)
        : await api.createUserWithEmailAndPassword(
            auth,
            email.trim(),
            password,
          );
      await refreshAccount(result.user);
      return account;
    },
    async signIn(email, password) {
      await ready;
      if (guestPromise) await guestPromise;
      const result = await signInPreservingGuest({api,auth,db,verifyCredentials},email.trim(),password);
      await refreshAccount(result.user);
      await recoverTransfers();
      return account;
    },
    async signOut() {
      await ready;
      clearSubscriptions();
      ++epoch;
      account = null;
      recoveryError = null;
      changed();
      await api.signOut(auth);
    },
    async resetPassword(email) {
      await ready;
      await api.sendPasswordResetEmail(auth, email.trim());
    },
    watchThreads(next, error, { developer = false } = {}) {
      return trackedWatch(threadQuery(developer), next, error, (s) => page(s));
    },
    async loadThreads({ developer = false, cursor } = {}) {
      await ready;
      return page(await api.getDocsFromServer(threadQuery(developer, cursor)));
    },
    watchThread(id, next, error) {
      return trackedWatch(api.doc(db,"feedbackThreads",id),next,error,s=>s.exists()?{id:s.id,...s.data()}:null);
    },
    watchMessages(id, next, error) {
      const q = api.query(
        api.collection(db, "feedbackThreads", id, "messages"),
        api.orderBy("createdAt", "desc"),
        api.limit(100),
      );
      return trackedWatch(q, next, error, (s) => page(s, true));
    },
    async loadMessages(id, cursor) {
      await ready;
      requireAccount();
      return page(
        await api.getDocsFromServer(
          api.query(
            api.collection(db, "feedbackThreads", id, "messages"),
            api.orderBy("createdAt", "desc"),
            ...(cursor ? [api.startAfter(cursor)] : []),
            api.limit(100),
          ),
        ),
        true,
      );
    },
    send,
    async sendLocationReport({ threadId, messageId, report, note = "" }) {
      for (const id of [threadId, messageId])
        if (typeof id !== "string" || !id || id.length > 80 || id.includes("/"))
          throw new Error("A valid report and message ID is required.");
      if (typeof note !== "string") throw new Error("The report note must be text.");
      const locationReport = normalizeLocationReport(report);
      const labels = { point: "target location", radius: "target radius", address: "address", name: "location name", scoring: "answer scoring", other: "location question" };
      const body = note.trim() || `Please review this possible ${labels[locationReport.reason]} issue.`;
      const label = locationReport.snapshot.question.name || locationReport.snapshot.question.address || locationReport.snapshot.callId;
      return send({
        threadId, messageId, body,
        newThread: {
          title: `Geo report: ${label}`.slice(0,120),
          category: locationReport.reason === "scoring" ? "bug" : "map",
          locationReport,
        },
      });
    },
    async markRead(id, developer = false, seenMessageId) {
      await ready;
      requireAccount();
      const ref = api.doc(db, "feedbackThreads", id);
      await api.runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists() || snap.data().lastMessageId !== seenMessageId) return;
        const t = snap.data(),
          key = developer ? "developerRead" : "playerRead",
          count = developer ? t.playerMessages : t.developerMessages;
        if (t[key] !== count) tx.update(ref, { [key]: count });
      });
    },
    async updateThread(id, changes) {
      await ready;
      requireAccount();
      const clean = {};
      for (const key of ["status", "priority"])
        if (key in changes) clean[key] = changes[key];
      await api.updateDoc(api.doc(db, "feedbackThreads", id), clean);
    },
    async loadNotes(id) {
      await ready;
      if (!requireAccount().isDeveloper) throw new Error("Developer access is required.");
      const snap = await api.getDocsFromServer(api.query(api.collection(db,"feedbackThreads",id,"notes"),api.orderBy("createdAt","asc")));
      return snap.docs.map(d=>({id:d.id,...d.data()}));
    },
    watchNotes(id, next, error) {
      return trackedWatch(
        api.query(
          api.collection(db, "feedbackThreads", id, "notes"),
          api.orderBy("createdAt", "asc"),
          api.limit(100),
        ),
        (snap) => next(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        error,
        (s) => s,
      );
    },
    async addNote(id, body, noteId) {
      await ready;
      const { uid } = requireAccount();
      body = normalizeBody(body);
      const ref = api.doc(db, "feedbackThreads", id, "notes", noteId);
      await api.runTransaction(db, async (tx) => {
        const old = await tx.get(ref);
        if (old.exists()) {
          if (old.data().authorId !== uid || old.data().body !== body)
            throw new Error("This note has already been used.");
          return;
        }
        tx.set(ref, { authorId: uid, body, createdAt: api.serverTimestamp() });
      });
    },
  };
}
