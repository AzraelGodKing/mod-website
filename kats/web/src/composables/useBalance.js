import { computed } from "vue";
import { useLocal } from "./useLocal.js";

/** "My coins": a viewer's balance, remembered in this browser, used to hide what they can't afford. */
export function useBalance() {
  const balance = useLocal("katsrics-balance", "");
  const limit = computed(() => {
    const value = Number(String(balance.value).replace(/[,\s]/g, ""));
    return String(balance.value).trim() !== "" && Number.isFinite(value) && value >= 0 ? value : null;
  });
  const affordable = (price) => limit.value == null || Number(price) <= limit.value;
  return { balance, limit, affordable };
}
