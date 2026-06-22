/* coach-config.example.js — copy to coach/coach-config.js and edit.
   The Worker URL is PUBLIC (not a secret). NEVER put an AI provider key here — the browser
   never holds one. */
window.HAMMY_COACH_CONFIG = {
  workerUrl: "https://YOUR-WORKER.workers.dev",
  developmentMock: false   // true only for local UI review without a deployed Worker
};
