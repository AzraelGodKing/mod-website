<script setup>
import PageIntro from "../components/PageIntro.vue";
import { links } from "../lib/nav";
</script>

<template>
  <div class="page-shell">
    <PageIntro kicker="Signal lost" title="Page not found" lede="That page isn't in the catalog. Pick one of these instead." />
    <main>
      <ul class="link-grid">
        <li v-for="link in links" :key="link.to"><router-link :to="link.to">{{ link.label }}</router-link></li>
      </ul>
    </main>
  </div>
</template>
