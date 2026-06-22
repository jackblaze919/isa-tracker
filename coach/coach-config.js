/* coach-config.js — active Ask Hammy config.
   The Worker URL is PUBLIC (not a secret). There is NEVER an AI provider key here.
   `developmentMock: true` lets the UI be reviewed without a deployed Worker; it is clearly
   labeled "Development mock" in the UI and never claims a real model is answering.
   Once the Cloudflare Worker is deployed (see coach-worker/README.md), set:
     workerUrl: "https://<your-worker>.workers.dev", developmentMock: false  */
window.HAMMY_COACH_CONFIG = {
  workerUrl: "https://hammy-coach.isa-hammy.workers.dev",
  developmentMock: false
};
