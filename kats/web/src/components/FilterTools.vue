<script setup>
import { computed } from "vue";
import { useBalance } from "../composables/useBalance";

const props = defineProps({
  active: { type: Number, default: 0 },
  starredOnly: { type: Boolean, default: false },
  starCount: { type: Number, default: 0 },
  showBalance: { type: Boolean, default: false },
});
const emit = defineEmits(["clear", "update:starredOnly"]);
const { balance, limit } = useBalance();
const total = computed(() => props.active + (props.showBalance && limit.value != null ? 1 : 0));
function clearAll() {
  if (props.showBalance) balance.value = "";
  emit("clear");
}
</script>

<template>
  <label v-if="showBalance" class="balance">
    <span>My coins</span>
    <input v-model="balance" type="text" inputmode="numeric" placeholder="any" aria-label="My coins: only show what I can afford" />
  </label>
  <label class="toggle" :title="starCount ? '' : 'Star rows to keep them here'">
    <input type="checkbox" :checked="starredOnly" @change="emit('update:starredOnly', $event.target.checked)" />
    Starred only<template v-if="starCount"> ({{ starCount }})</template>
  </label>
  <button v-if="total" type="button" class="clear-btn" @click="clearAll">Clear filters ({{ total }})</button>
</template>
