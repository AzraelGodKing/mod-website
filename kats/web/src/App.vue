<script setup>
import AppSidebar from "./components/AppSidebar.vue";
import AppFooter from "./components/AppFooter.vue";
import AppToast from "./components/AppToast.vue";
import { useStickyOffsets } from "./composables/useStickyOffsets";

useStickyOffsets();
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
  <AppToast />
</template>
