<script setup>
import { toast } from "../composables/useCopy";
</script>

<template>
  <div class="toast-region" role="status" aria-live="polite">
    <transition name="toast">
      <p v-if="toast" class="toast">{{ toast }}</p>
    </transition>
  </div>
</template>
