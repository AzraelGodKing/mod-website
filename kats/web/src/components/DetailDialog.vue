<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { copyText, toast } from "../composables/useCopy";
import { useCart } from "../composables/useCart";
import { useCompare, COMPARE_MAX } from "../composables/useCompare";
import PriceHistory from "./PriceHistory.vue";

const props = defineProps({ details: { type: Object, default: null } });
const emit = defineEmits(["close"]);

const dialog = ref(null);
const qty = ref(1);

watch(
  () => props.details,
  async (value) => {
    qty.value = 1;
    await nextTick();
    if (value && !dialog.value?.open) dialog.value?.showModal?.();
    if (!value && dialog.value?.open) dialog.value.close();
  },
  { immediate: true },
);

const maxQty = computed(() => props.details?.quantity?.max || 999);
const safeQty = computed(() => Math.min(maxQty.value, Math.max(1, Math.floor(Number(qty.value) || 1))));
const buyCommand = computed(() => {
  const q = props.details?.quantity;
  if (!q) return "";
  return safeQty.value > 1 ? `${q.command} ${safeQty.value}` : q.command;
});
const total = computed(() => (props.details?.quantity ? props.details.quantity.price * safeQty.value : 0));

const cart = useCart();
const compare = useCompare();
const trade = computed(() => (props.details?.trade?.command ? props.details.trade : null));
const inCart = computed(() => trade.value && cart.has(props.details.catalog, trade.value.label));
function addToCart() {
  cart.add(props.details.catalog, trade.value, trade.value.many ? safeQty.value : 1);
  toast.value = `Added ${trade.value.label} to the cart`;
  setTimeout(() => (toast.value = ""), 2200);
}

function onClick(event) {
  if (event.target === dialog.value) dialog.value.close();
}
</script>

<template>
  <dialog ref="dialog" class="detail-dialog" aria-labelledby="detail-title" @close="emit('close')" @click="onClick">
    <div v-if="details" class="detail-body">
      <header>
        <div>
          <h2 id="detail-title">{{ details.title }}</h2>
          <p v-if="details.subtitle" class="muted">{{ details.subtitle }}</p>
        </div>
        <button type="button" class="detail-close" aria-label="Close" @click="dialog.close()">✕</button>
      </header>
      <p v-if="details.description" class="detail-desc">{{ details.description }}</p>
      <dl class="detail-fields">
        <template v-for="[label, value] in details.fields" :key="label">
          <dt>{{ label }}</dt>
          <dd>{{ value }}</dd>
        </template>
      </dl>
      <div v-if="details.quantity" class="detail-qty">
        <label>
          Quantity
          <input v-model="qty" type="number" min="1" :max="maxQty" inputmode="numeric" />
        </label>
        <span>Total <b>{{ total.toLocaleString() }}</b> coins</span>
        <button type="button" class="copy-btn" @click="copyText(buyCommand)">Copy {{ buyCommand }}</button>
      </div>
      <div v-if="details.catalog" class="detail-actions">
        <button v-if="trade" type="button" class="action-btn primary" @click="addToCart">
          {{ inCart ? (trade.many ? "Add more to cart" : "In the cart") : "Add to cart" }}
        </button>
        <button type="button" class="action-btn" :aria-pressed="compare.has(details) ? 'true' : 'false'" @click="compare.toggle(details)">
          {{ compare.has(details) ? "Remove from compare" : `Compare (up to ${COMPARE_MAX})` }}
        </button>
      </div>
      <PriceHistory v-if="details.trade?.history" :catalog="details.catalog" :label="details.trade.history" />
      <div v-if="details.commands?.length" class="detail-commands">
        <h3>Chat commands</h3>
        <button v-for="cmd in details.commands" :key="cmd" type="button" class="command-chip" @click="copyText(cmd)">
          {{ cmd }}
        </button>
      </div>
    </div>
  </dialog>
</template>
