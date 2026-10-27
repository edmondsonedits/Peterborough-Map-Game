// Public browser configuration only. Never put Admin SDK credentials here.
// Enable after deploying feedback/firebase.json to a dedicated Firebase project.
export const feedbackConfig = Object.freeze({
  enabled: false,
  firebase: Object.freeze({
    apiKey: "",
    authDomain: "",
    projectId: "",
    appId: "",
  }),
});
