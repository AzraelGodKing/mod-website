<script setup>
import { onMounted, ref } from "vue";
import { loadMeta, longDate } from "../lib/data";

const updated = ref("");
onMounted(async () => {
  const meta = await loadMeta();
  updated.value = longDate(meta?.updatedAt);
});
</script>

<template>
  <footer>
    <span>
      Synced from CAP ChatInteractive<template v-if="updated"> · catalog updated {{ updated }}</template>
      · <router-link to="/changes">what changed</router-link>
    </span>
    <span class="footer-links">
      <a href="https://github.com/AzraelGodKing/mod-website/tree/main/kats">source</a>
      <a href="https://github.com/ekudram/-cap-RimworldInteractiveChatServices">RICS</a>
    </span>
  </footer>
</template>
