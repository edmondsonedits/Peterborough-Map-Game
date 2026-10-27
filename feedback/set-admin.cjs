"use strict";
// Trusted, operator-run tool. Uses Application Default Credentials; never ships credentials to the browser.
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const [projectId, uid, flag] = process.argv.slice(2);
if (!projectId || !uid || (flag && flag !== "--revoke")) {
  console.error(
    "Usage: node feedback/set-admin.cjs <project-id> <firebase-user-uid> [--revoke]",
  );
  process.exitCode = 1;
} else {
  const app = initializeApp({ projectId, credential: applicationDefault() });
  (async () => {
    const auth = getAuth(app),
      user = await auth.getUser(uid),
      claims = { ...user.customClaims };
    if (flag === "--revoke") delete claims.feedbackAdmin;
    else claims.feedbackAdmin = true;
    await auth.setCustomUserClaims(uid, claims);
    console.log(
      `Feedback developer access ${flag === "--revoke" ? "revoked" : "granted"}. Sign out and back in to refresh access.`,
    );
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
