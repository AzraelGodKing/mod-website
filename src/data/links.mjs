// Links shared by the main site and the subdomains (status/, docs-site/, live/).
export const KOFI_URL = "https://ko-fi.com/azraelgodking";

export const SUBDOMAINS = {
  docs: { href: "https://docs.azraelsmods.com", label: "Tool guides" },
  status: { href: "https://status.azraelsmods.com", label: "Site status" },
  live: { href: "https://live.azraelsmods.com", label: "Stream overlay" },
};

// Every site on azraelsmods.com, for the admin page. `status` is the id on
// status.azraelsmods.com/api/status, so the card can show whether it is up.
export const ADMIN_SITES = [
  { name: "Kat's RICS", href: "https://kats.azraelsmods.com", note: "Chat coin catalog", status: "kats" },
  { name: "Lantern", href: "https://lantern.azraelsmods.com", note: "5e table companion", status: "lantern" },
  { name: "Tool guides", href: SUBDOMAINS.docs.href, note: "Modwright and Survivor's Toolkit docs", status: "docs" },
  { name: "Stream overlay", href: SUBDOMAINS.live.href, note: "OBS overlay builder", status: "live" },
  { name: "Site status", href: SUBDOMAINS.status.href, note: "Uptime for everything", status: "overall" },
  { name: "Ko-fi", href: KOFI_URL, note: "Support page", status: null },
];
