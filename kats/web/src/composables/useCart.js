import { computed } from "vue";
import { useLocal } from "./useLocal.js";

/** The cart: things to buy with chat coins, saved in this browser. */
export function useCart() {
  const lines = useLocal("katsrics-cart", []);
  const clampQty = (line, qty) => {
    const whole = Math.max(1, Math.floor(Number(qty) || 1));
    if (!line.many) return 1;
    return line.max ? Math.min(line.max, whole) : Math.min(999, whole);
  };
  const idOf = (catalog, label) => `${catalog}:${label}`;
  function add(catalog, trade, qty = 1) {
    if (!trade?.command) return;
    const id = idOf(catalog, trade.label);
    const found = lines.value.find((line) => line.id === id);
    if (found) {
      // The catalog may have repriced it since it went in the cart.
      Object.assign(found, { price: trade.price, max: trade.max || 0, qty: clampQty(found, trade.many ? found.qty + qty : 1) });
      lines.value = [...lines.value];
      return;
    }
    const line = { id, catalog, label: trade.label, price: trade.price, command: trade.command, max: trade.max || 0, many: !!trade.many, qty: 1 };
    line.qty = clampQty(line, qty);
    lines.value = [...lines.value, line];
  }
  function setQty(id, qty) {
    lines.value = lines.value.map((line) => (line.id === id ? { ...line, qty: clampQty(line, qty) } : line));
  }
  function remove(id) {
    lines.value = lines.value.filter((line) => line.id !== id);
  }
  function clear() {
    lines.value = [];
  }
  const commandOf = (line) => (line.qty > 1 ? `${line.command} ${line.qty}` : line.command);
  return {
    lines,
    count: computed(() => lines.value.length),
    total: computed(() => lines.value.reduce((sum, line) => sum + line.price * line.qty, 0)),
    commands: computed(() => lines.value.map(commandOf)),
    has: (catalog, label) => lines.value.some((line) => line.id === idOf(catalog, label)),
    add,
    setQty,
    remove,
    clear,
    commandOf,
  };
}
