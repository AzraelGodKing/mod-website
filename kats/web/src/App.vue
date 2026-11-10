<script setup>
import AppSidebar from "./components/AppSidebar.vue";
import AppFooter from "./components/AppFooter.vue";
import AppToast from "./components/AppToast.vue";
import BackToTop from "./components/BackToTop.vue";
import CompareBar from "./components/CompareBar.vue";
import { onBeforeUnmount, onMounted } from "vue";
import { useStickyOffsets } from "./composables/useStickyOffsets";

useStickyOffsets();

// "/" jumps to the search box on the current page, like most search sites.
function onKey(event) {
  if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target.closest?.("input, textarea, select, [contenteditable]")) return;
  const box =
    document.querySelector(".panel.active .controls input[type=search]") ||
    document.querySelector(".page-shell .controls input[type=search]") ||
    document.querySelector(".rail-search input");
  if (!box) return;
  event.preventDefault();
  box.focus();
  box.select();
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <a class="skip-link" href="#content">Skip to the catalog</a>
  <div class="app-frame">
    <AppSidebar />
    <div id="content" class="stage" tabindex="-1">
      <router-view />
      <AppFooter />
    </div>
  </div>
  <CompareBar />
  <AppToast />
  <BackToTop />
</template>
