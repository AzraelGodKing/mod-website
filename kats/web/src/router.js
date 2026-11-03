import { createRouter, createWebHistory } from "vue-router";
import StoreView from "./views/StoreView.vue";
import TraitsView from "./views/TraitsView.vue";
import BackstoriesView from "./views/BackstoriesView.vue";
import EventsView from "./views/EventsView.vue";
import CommandsView from "./views/CommandsView.vue";
import IsekaiView from "./views/IsekaiView.vue";
import GenesView from "./views/GenesView.vue";
import ChangesView from "./views/ChangesView.vue";
import SearchView from "./views/SearchView.vue";
import NotFoundView from "./views/NotFoundView.vue";
import { LEGACY_PAGES, legacyPagePath } from "./lib/legacy";

export const routes = [
  { path: "/", name: "store", component: StoreView, meta: { title: "Store" } },
  { path: "/traits", name: "traits", component: TraitsView, meta: { title: "Traits" } },
  { path: "/backstories", name: "backstories", component: BackstoriesView, meta: { title: "Backstories" } },
  { path: "/events", name: "events", component: EventsView, meta: { title: "Events" } },
  { path: "/commands", name: "commands", component: CommandsView, meta: { title: "Commands" } },
  { path: "/isekai", name: "isekai", component: IsekaiView, meta: { title: "Isekai" } },
  { path: "/genes", name: "genes", component: GenesView, meta: { title: "Genes" } },
  { path: "/changes", name: "changes", component: ChangesView, meta: { title: "What changed" } },
  { path: "/search", name: "search", component: SearchView, meta: { title: "Search" } },
  {
    path: `/:page(${LEGACY_PAGES.join("|")}).html`,
    redirect: (to) => ({ path: legacyPagePath(to.params.page), query: to.query }),
  },
  { path: "/:pathMatch(.*)*", name: "missing", component: NotFoundView, meta: { title: "Not found" } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from) {
    if (to.path === from.path) return false;
    return { top: 0 };
  },
});

router.afterEach((to) => {
  const page = to.meta.title ? ` — ${to.meta.title}` : "";
  document.title = `Kat's RICS${page}`;
});

export default router;
