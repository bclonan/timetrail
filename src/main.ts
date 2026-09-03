import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import HomePage from "./pages/HomePage.vue";
import NewProjectPage from "./pages/NewProjectPage.vue";
import WorkspacePage from "./pages/WorkspacePage.vue";
import WatchPage from "./pages/WatchPage.vue";
import DiscoverPage from "./pages/DiscoverPage.vue";
import WebMcpLabPage from "./pages/WebMcpLabPage.vue";
import ExamplesPage from "./pages/ExamplesPage.vue";
import HackathonPage from "./pages/HackathonPage.vue";
import { installRegistry } from "./webmcp/registry";
import { useWorkspace } from "./stores/workspace";
import { storage } from "./storage/BrowserWorkspaceStore";
import "./style.css";
import "./player.css";
// Share payloads stay in the fragment. Normalize only the local route.
if (location.pathname === "/" && location.hash.startsWith("#/watch?tt="))
  history.replaceState(
    null,
    "",
    "/player/shared" + location.search + location.hash,
  );
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomePage },
    { path: "/new", component: NewProjectPage },
    { path: "/project/:projectId", component: WorkspacePage },
    { path: "/watch/:projectId", component: WatchPage },
    { path: "/player/:projectId", component: WatchPage },
    { path: "/discover", component: DiscoverPage },
    { path: "/demo", component: WorkspacePage },
    { path: "/webmcp", component: WebMcpLabPage },
    { path: "/hackathon", alias: "/webmcp/about", component: HackathonPage },
    { path: "/examples", component: ExamplesPage },
    { path: "/:pathMatch(.*)*", component: HomePage },
  ],
});
const app = createApp(App);
app.use(createPinia());
app.use(router);
app.config.errorHandler = (error) => {
  useWorkspace().error = error instanceof Error ? error.message : String(error);
};
await router.isReady();
const last = await storage
  .setting<string>("lastProject")
  .catch(() => undefined);
if (last && !useWorkspace().approved)
  await useWorkspace().run(() => useWorkspace().load(last));
installRegistry(router);
app.mount("#app");
if (import.meta.env.PROD && "serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {
    useWorkspace().notify(
      "Offline cache could not be installed. Editing remains available while online.",
    );
  });
