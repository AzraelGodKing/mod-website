import { createRouter, createWebHistory } from "vue-router";
import StoreView from "./views/StoreView.vue";
import { LEGACY_PAGES, legacyPagePath } from "./lib/legacy";

export const routes = [
  { path: "/", name: "store", component: StoreView, meta: { title: "Store" } },
  { path: "/traits", name: "traits", component: () => import("./views/TraitsView.vue"), meta: { title: "Traits" } },
  { path: "/backstories", name: "backstories", component: () => import("./views/BackstoriesView.vue"), meta: { title: "Backstories" } },
  { path: "/events", name: "events", component: () => import("./views/EventsView.vue"), meta: { title: "Events" } },
  { path: "/commands", name: "commands", component: () => import("./views/CommandsView.vue"), meta: { title: "Commands" } },
  { path: "/isekai", name: "isekai", component: () => import("./views/IsekaiView.vue"), meta: { title: "Isekai" } },
  { path: "/genes", name: "genes", component: () => import("./views/GenesView.vue"), meta: { title: "Genes" } },
  { path: "/changes", name: "changes", component: () => import("./views/ChangesView.vue"), meta: { title: "What changed" } },
  { path: "/search", name: "search", component: () => import("./views/SearchView.vue"), meta: { title: "Search" } },
  {
    path: `/:page(${LEGACY_PAGES.join("|")}).html`,
    redirect: (to) => ({ path: legacyPagePath(to.params.page), query: to.query }),
  },
  { path: "/:pathMatch(.*)*", name: "missing", component: () => import("./views/NotFoundView.vue"), meta: { title: "Not found" } },
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
