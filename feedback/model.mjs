import { normalizeLocationReport } from "./location-report.mjs";
export const categories = Object.freeze({
  bug: "Bug",
  map: "Map correction",
  idea: "Idea",
  question: "Question",
});
export const statuses = Object.freeze({
  new: "New",
  reviewing: "Under review",
  planned: "Planned",
  resolved: "Resolved",
  closed: "Closed",
});
export const priorities = Object.freeze({ normal: "Normal", high: "High" });
function text(value, label, max, required = true) {
  const result = String(value ?? "").trim();
  if (required && !result) throw new Error(`${label} is required.`);
  if (result.length > max)
    throw new Error(`${label} must be ${max} characters or fewer.`);
  return result;
}
export function normalizeBody(value) {
  return text(value, "Message", 4000);
}
export function normalizeNewThread(input, context = {}) {
  const category = text(input.category, "Category", 20);
  if (!Object.hasOwn(categories, category))
    throw new Error("Choose a valid category.");
  const out = {
    title: text(input.title, "Title", 120),
    body: normalizeBody(input.body),
    category,
  };
  for (const key of ["city", "mode", "department", "version"])
    out[key] =
      text(input[key] ?? context[key] ?? "unknown", key, 80, false) ||
      "unknown";
  if (Object.hasOwn(input, "locationReport")) {
    out.locationReport = normalizeLocationReport(input.locationReport);
    const snapshot = out.locationReport.snapshot;
    out.city = snapshot.city;
    out.mode = snapshot.mode;
    out.department = snapshot.service;
    out.version = snapshot.version;
  }
  return out;
}
export function unreadCount(thread, role) {
  return Math.max(
    0,
    role === "developer"
      ? (thread.playerMessages || 0) - (thread.developerRead || 0)
      : (thread.developerMessages || 0) - (thread.playerRead || 0),
  );
}
export function filterThreads(threads, filters = {}, uid, isDeveloper = false) {
  const search = String(filters.search || "")
    .trim()
    .toLocaleLowerCase();
  return threads
    .filter(
      (t) =>
        (isDeveloper || t.ownerId === uid) &&
        ["city", "mode", "category", "status"].every(
          (k) => !filters[k] || t[k] === filters[k],
        ) &&
        (!filters.unread ||
          unreadCount(t, isDeveloper ? "developer" : "player") > 0) &&
        (!search ||
          [t.title, t.city, t.mode, t.department]
            .join(" ")
            .toLocaleLowerCase()
            .includes(search)),
    )
    .sort(
      (a, b) =>
        (b.updatedAt?.toMillis?.() ?? b.updatedAt ?? 0) -
        (a.updatedAt?.toMillis?.() ?? a.updatedAt ?? 0),
    );
}
export function errorMessage(error) {
  const code = error?.code || "";
  if (
    [
      "auth/invalid-credential",
      "auth/user-not-found",
      "auth/wrong-password",
      "auth/invalid-login-credentials",
    ].includes(code)
  )
    return "Could not sign in. Check your email and password.";
  if (
    code === "auth/email-already-in-use" ||
    code === "auth/credential-already-in-use"
  )
    return "Could not create this account. Try signing in or resetting your password.";
  if (code === "auth/weak-password")
    return "Choose a stronger password with at least 8 characters.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "permission-denied")
    return "Could not access this conversation or save this change. Please try again.";
  if (
    code === "auth/operation-not-allowed" ||
    code === "auth/configuration-not-found" ||
    code === "feedback/unavailable"
  )
    return "Feedback accounts are unavailable right now. You can continue playing.";
  if (code === "auth/too-many-requests" || code === "resource-exhausted")
    return "Please wait a moment before trying again.";
  if (code === "feedback/throttled")
    return "Please wait a second before sending another message.";
  if (code.startsWith("auth/") || code === "unavailable")
    return "Could not connect. Please try again.";
  return error?.message || "Could not complete this action. Please try again.";
}
