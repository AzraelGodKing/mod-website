// The overlay: reads its settings from the URL (made on the builder page), loads the
// picked mods and Kat's RICS lists, and cycles one card at a time.
const params = new URLSearchParams(location.search);
const POSITIONS = ["tl", "tr", "bl", "br"];
const TYPES = ["mods", "milestones", "bloodmoon", "kofi", "message", "commands", "addon-commands", "store", "events", "weather"];
const num = (key, fallback, min, max) => {
  const v = Number(params.get(key));
  return params.get(key) !== null && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};
const settings = {
  mods: (params.get("mods") ?? "").split(",").filter((s) => /^[a-z0-9-]+\/[a-z0-9-]+$/.test(s)),
  show: [...new Set((params.get("show") ?? "mods").split(",").filter((s) => TYPES.includes(s)))],
  every: num("every", 15, 5, 120),
  pos: POSITIONS.includes(params.get("pos")) ? params.get("pos") : "br",
  theme: ["dark", "light", "glass"].includes(params.get("theme")) ? params.get("theme") : "dark",
  scale: num("scale", 1, 0.6, 2),
  title: (params.get("title") ?? "").slice(0, 60),
  msg: (params.get("msg") ?? "").slice(0, 160),
  moon: num("moon", 7, 1, 30),
  // ?demo=1 (the builder's preview) shows an example alert and countdown without waiting for real ones.
  demo: params.get("demo") === "1",
};

const stage = document.getElementById("stage");
const card = document.getElementById("card");
const timer = document.getElementById("timer");
stage.dataset.pos = settings.pos;
document.body.dataset.theme = settings.theme;
card.style.setProperty("--scale", String(settings.scale));
card.style.setProperty("--every", `${settings.every}s`);
card.style.setProperty("--origin", `${settings.pos[0] === "t" ? "top" : "bottom"} ${settings.pos[1] === "l" ? "left" : "right"}`);

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) if (child != null && child !== "") node.append(child);
  return node;
};
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const shuffle = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

let data = { mods: [], kats: {}, counts: null, moon: null };
// Alerts jump the queue: a mod passing a download milestone while the stream is live.
const alerts = [];

// The same steps as milestoneSteps() in live/src/feed.mjs: 100, 250, 500, then 1, 2.5 and 5 times each power of ten.
function steps(upTo) {
  const list = [100, 250, 500];
  for (let base = 1000; list.at(-1) <= upTo; base *= 10) list.push(base, base * 2.5, base * 5);
  return list;
}
const nextStep = (count) => steps(count).find((step) => step > count);
const crossed = (before, after) => (after > before ? steps(after).filter((step) => step > before && step <= after).at(-1) ?? null : null);

async function getJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

async function load() {
  const next = { mods: data.mods, kats: { ...data.kats }, counts: data.counts, moon: data.moon };
  const jobs = [];
  const wantsCounts = settings.show.includes("milestones") && settings.mods.length;
  if (wantsCounts) {
    jobs.push(
      getJson("/api/counts").then((body) => {
        const before = data.counts;
        next.counts = body.counts;
        if (!before) return;
        for (const key of settings.mods) {
          const hit = crossed(before[key] ?? 0, body.counts[key] ?? 0);
          const mod = next.mods.find((entry) => entry.key === key) ?? data.mods.find((entry) => entry.key === key);
          if (hit && mod) alerts.push({ alert: true, kicker: "Milestone!", big: `${mod.name} just passed ${hit.toLocaleString()} downloads`, foot: "Thank you! Free at azraelsmods.com" });
        }
      }),
    );
  }
  if (settings.show.includes("bloodmoon")) jobs.push(getJson("/api/bloodmoon").then((body) => (next.moon = body)));
  if ((settings.show.includes("mods") || wantsCounts) && settings.mods.length) {
    jobs.push(
      getJson("/api/mods").then((body) => {
        const byKey = new Map(body.mods.map((mod) => [mod.key, mod]));
        next.mods = settings.mods.map((key) => byKey.get(key)).filter(Boolean);
      }),
    );
  }
  for (const type of settings.show) {
    if (["mods", "milestones", "bloodmoon", "kofi", "message"].includes(type)) continue;
    jobs.push(getJson(`/api/kats/${type}`).then((body) => (next.kats[type] = body)));
  }
  await Promise.allSettled(jobs);
  data = next;
}

// One full round of cards, rebuilt each round so command picks change.
function slides() {
  const out = [];
  for (const type of settings.show) {
    if (type === "mods" && data.mods.length) {
      const games = [...new Set(data.mods.map((mod) => mod.game))];
      for (const group of chunk(data.mods, 5)) {
        out.push({
          kicker: settings.title || "Mods on stream",
          items: group.map((mod) => ({ name: mod.name, side: mod.version ? `v${mod.version}` : "" })),
          foot: `Free at azraelsmods.com${games.length === 1 ? `/${games[0]}` : ""}`,
        });
      }
    } else if (type === "milestones" && data.counts && data.mods.length) {
      const rows = data.mods
        .filter((mod) => data.counts[mod.key] > 0)
        .map((mod) => ({ mod, count: data.counts[mod.key], next: nextStep(data.counts[mod.key]) }))
        // The ones closest to their next milestone lead.
        .sort((a, b) => (a.next - a.count) / a.next - (b.next - b.count) / b.next);
      for (const group of chunk(rows, 4)) {
        out.push({
          kicker: "Download milestones",
          items: group.map(({ mod, count, next: goal }) => ({ name: mod.name, text: `${(goal - count).toLocaleString()} to go until ${goal.toLocaleString()}`, side: count.toLocaleString() })),
          foot: "Every download counts. Free at azraelsmods.com",
        });
      }
    } else if (type === "bloodmoon") {
      const day = settings.demo && !Number.isInteger(data.moon?.day) ? 19 : data.moon?.day;
      // A server that has not reported for a while is off; an old day would be wrong.
      if (Number.isInteger(day) && day > 0 && (data.moon?.fresh || settings.demo)) {
        const left = (settings.moon - (day % settings.moon)) % settings.moon;
        out.push({
          moon: left === 0,
          kicker: `Day ${day.toLocaleString()}`,
          big: left === 0 ? "Blood moon tonight" : `Blood moon in ${left} ${left === 1 ? "day" : "days"}`,
          foot: left === 0 ? "The horde comes at nightfall." : `Next horde on day ${(day + left).toLocaleString()}.`,
        });
      }
    } else if (type === "kofi") {
      out.push({ kicker: "Support the mods", big: "ko-fi.com/azraelgodking", foot: "Every coffee keeps the updates coming. Thank you!" });
    } else if (type === "message" && settings.msg) {
      out.push({ kicker: settings.title || "Azrael's Mods", big: settings.msg });
    } else if (data.kats[type]?.lines?.length) {
      const list = data.kats[type];
      out.push({
        kicker: list.label,
        items: shuffle(list.lines).slice(0, 4).map((line) => ({ cmd: line.cmd, text: line.text, side: line.cost ? `${line.cost.toLocaleString()} coins` : "" })),
        foot: "Type it in chat · full list at kats.azraelsmods.com",
      });
    }
  }
  return out;
}

function show(slide) {
  card.classList.toggle("alert", !!slide.alert);
  card.classList.toggle("moon", !!slide.moon);
  document.getElementById("kicker").textContent = slide.kicker ?? "";
  document.getElementById("foot").textContent = slide.foot ?? "";
  const content = document.getElementById("content");
  if (slide.big) {
    content.replaceChildren(el("p", { className: "big", textContent: slide.big }));
  } else {
    content.replaceChildren(
      el(
        "ul",
        { className: "items" },
        ...slide.items.map((item) =>
          el(
            "li",
            {},
            el("span", { className: "name" }, item.cmd ? el("code", { textContent: item.cmd }) : item.name, item.text ? el("span", { className: "text", textContent: item.text }) : null),
            item.side ? el("span", { className: "side", textContent: item.side }) : null,
          ),
        ),
      ),
    );
  }
}

let queue = [];
async function tick() {
  if (!queue.length) queue = slides();
  const slide = alerts.shift() ?? queue.shift();
  if (!slide) {
    card.hidden = true;
    setTimeout(tick, 5000);
    return;
  }
  card.classList.add("out");
  await new Promise((resolve) => setTimeout(resolve, card.hidden ? 0 : 450));
  card.hidden = false;
  show(slide);
  timer.classList.remove("run");
  void timer.offsetWidth;
  timer.classList.add("run");
  card.classList.remove("out");
  setTimeout(tick, settings.every * 1000);
}

card.hidden = true;
await load();
if (settings.demo && settings.show.includes("milestones") && data.mods[0]) {
  alerts.push({ alert: true, kicker: "Milestone! (example)", big: `${data.mods[0].name} just passed 1,000 downloads`, foot: "Thank you! Free at azraelsmods.com" });
}
// Counts and the in-game day move faster than the lists, so they are read every 2 minutes.
const quick = settings.show.includes("milestones") || settings.show.includes("bloodmoon");
setInterval(load, (quick ? 2 : 10) * 60 * 1000);
tick();
