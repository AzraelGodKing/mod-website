<script setup>
import { computed } from "vue";
import PageIntro from "../components/PageIntro.vue";
import { useCart } from "../composables/useCart";
import { useBalance } from "../composables/useBalance";
import { copyText } from "../composables/useCopy";
import { CATALOG_PAGES } from "../lib/catalogs";
import { fmt } from "../lib/data";

const cart = useCart();
const { balance, limit } = useBalance();
const left = computed(() => (limit.value == null ? null : limit.value - cart.total.value));
const stats = computed(() => [
  { value: String(cart.count.value), label: cart.count.value === 1 ? "line" : "lines" },
  { value: fmt(cart.total.value), label: "coins" },
]);
function copyAll() {
  copyText(cart.commands.value.join("\n"));
}
</script>

<template>
  <div class="page-shell">
    <PageIntro
      kicker="Channel 09"
      title="Cart"
      lede="Line up what you want to buy, see what it costs in coins, and copy the chat commands."
      :stats="stats"
    >
      Add things with the ⓘ button on any row. Chat takes one command per message, so paste them one at a time, or use
      the Copy button on each line.
    </PageIntro>
    <main class="cart">
      <div v-if="!cart.count.value" class="empty">
        Your cart is empty. Open the <router-link to="/">Store</router-link>, tap ⓘ on a row and choose “Add to cart”.
      </div>
      <template v-else>
        <section class="change-card">
          <ul class="cart-list">
            <li v-for="line in cart.lines.value" :key="line.id">
              <div class="cart-what">
                <router-link :to="CATALOG_PAGES[line.catalog].link(line.label)" class="hit-label">{{ line.label }}</router-link>
                <span class="hit-detail">{{ CATALOG_PAGES[line.catalog].title }} · {{ fmt(line.price) }} coins each</span>
              </div>
              <label v-if="line.many" class="cart-qty">
                <span class="sr-only">Quantity of {{ line.label }}</span>
                <input
                  type="number"
                  min="1"
                  :max="line.max || 999"
                  inputmode="numeric"
                  :value="line.qty"
                  @change="cart.setQty(line.id, $event.target.value)"
                />
              </label>
              <span v-else class="cart-qty muted">×1</span>
              <b class="cart-line-total">{{ fmt(line.price * line.qty) }}</b>
              <button type="button" class="copy-btn" :aria-label="`Copy ${cart.commandOf(line)}`" @click="copyText(cart.commandOf(line))">Copy</button>
              <button type="button" class="detail-close cart-remove" :aria-label="`Remove ${line.label}`" @click="cart.remove(line.id)">✕</button>
            </li>
          </ul>
        </section>
        <section class="change-card cart-summary">
          <p class="cart-total">Total <b>{{ fmt(cart.total.value) }}</b> coins</p>
          <label class="balance">
            <span>My coins</span>
            <input v-model="balance" type="text" inputmode="numeric" placeholder="optional" aria-label="My coins" />
          </label>
          <p v-if="left != null" :class="['cart-left', left < 0 ? 'short' : 'ok']" role="status">
            {{ left < 0 ? `${fmt(-left)} coins short` : `${fmt(left)} coins left after this` }}
          </p>
          <div class="cart-actions">
            <button type="button" class="action-btn primary" @click="copyAll">Copy all {{ cart.count.value }} commands</button>
            <button type="button" class="link-btn" @click="cart.clear()">Empty the cart</button>
          </div>
          <pre class="cart-commands" aria-label="Commands">{{ cart.commands.value.join("\n") }}</pre>
        </section>
      </template>
    </main>
  </div>
</template>
