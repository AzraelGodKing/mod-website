import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./assets/site.css";

// Pages load on demand. Wait for the first one so the frame doesn't render empty and then jump.
const app = createApp(App).use(router);
router.isReady().finally(() => app.mount("#app"));
