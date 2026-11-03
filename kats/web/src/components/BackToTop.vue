<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";

const show = ref(false);
function onScroll() {
  show.value = window.scrollY > 900;
}
function toTop() {
  window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
onMounted(() => window.addEventListener("scroll", onScroll, { passive: true }));
onBeforeUnmount(() => window.removeEventListener("scroll", onScroll));
</script>

<template>
  <button v-if="show" type="button" class="to-top" aria-label="Back to top" @click="toTop">↑ Top</button>
</template>
