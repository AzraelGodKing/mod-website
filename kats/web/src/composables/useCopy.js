import { ref } from "vue";

export const toast = ref("");
let timer;

function fallbackCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

export async function copyText(text) {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    ok = fallbackCopy(text);
  }
  toast.value = ok ? `Copied ${text}` : "Copy didn't work in this browser";
  clearTimeout(timer);
  timer = setTimeout(() => {
    toast.value = "";
  }, 2200);
  return ok;
}
