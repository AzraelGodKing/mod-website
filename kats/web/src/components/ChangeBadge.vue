<script setup>
defineProps({ info: { type: Object, default: null } });
</script>

<template>
  <span v-if="info" :class="['change-badge', info.kind]" :title="info.title">{{ info.text }}</span>
</template>
