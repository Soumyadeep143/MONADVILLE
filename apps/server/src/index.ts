import { createApp } from "./api/app.js";
import { env } from "./config/env.js";
import { startScheduler } from "./simulation/scheduler.js";

const app = createApp();

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`econforge-api listening on :${env.PORT} (persistence=${env.PERSISTENCE_DRIVER}, ledger=${env.LEDGER_DRIVER}, auth=${env.AUTH_DRIVER})`);
  startScheduler();
});
