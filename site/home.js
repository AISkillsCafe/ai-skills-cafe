"use strict";
/* Welcome page: random sources orbiting the cup, today's specials, categories. */
const CATS = {
  docs: ["Documents & Office", "📄"], code: ["Coding & Engineering", "🛠️"], design: ["Design & Creative", "🎨"],
  data: ["Data & Research", "📊"], science: ["Science", "🔬"], writing: ["Writing & Marketing", "✍️"],
  workflow: ["Planning & Workflow", "🧭"], other: ["Everything else", "✨"],
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s) => document.querySelector(s);
const AVATAR = /^https:\/\/avatars\.githubusercontent\.com\/[^\s"'<>]+$/;

function shuffle(list, rand = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/* Same "random" picks all day for everyone, new picks tomorrow. */
function dailyRand() {
  let x = Number(new Date().toISOString().slice(0, 10).replace(/-/g, "")) || 1;
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
}

function drawOrbit(sources) {
  const many = matchMedia("(min-width: 640px)").matches ? 10 : 8;
  // People and community teams only: "official" sources are big companies, whose logos could look like an endorsement.
  const pool = sources.filter((s) => s.tier !== "official" && AVATAR.test(s.avatar || ""));
  const picked = shuffle(pool).slice(0, many);
  const orbit = $("#orbit");
  orbit.style.setProperty("--n", picked.length);
  orbit.innerHTML = picked.map((s, i) => `
    <a class="sat" style="--i:${i}" href="/menu?source=${encodeURIComponent(s.repo)}" title="${esc(s.repo)} — ${s.skills} skill${s.skills === 1 ? "" : "s"}">
      <span class="sat-in"><img src="${esc(s.avatar)}&s=96" alt="" width="54" height="54" loading="lazy"><small>${esc(s.owner)}</small></span>
    </a>`).join("");
  $("#orbit-note").textContent = `Circling the cup are ${picked.length} of the ${pool.length} people and teams whose skills are on our menu — a new mix every visit. Tap one to see their skills.`;
}

function drawSpecials(skills) {
  const pool = skills.filter((s) => (s.tier === "official" || s.tier === "trusted") && s.summary);
  const rand = dailyRand(), seen = new Set(), picks = [];
  for (const s of shuffle(pool, rand)) {           // different category and source each, so the three feel different
    if (seen.has(s.category) || seen.has(s.repo)) continue;
    seen.add(s.category); seen.add(s.repo); picks.push(s);
    if (picks.length === 3) break;
  }
  $("#specials").innerHTML = picks.map((s) => `
    <a class="special" href="/menu?open=${encodeURIComponent(s.id)}" style="--c:var(--c-${s.category})">
      <span class="glyph">${CATS[s.category] ? CATS[s.category][1] : "✨"}</span>
      <b>${esc(s.name)}</b><small>by ${esc(s.author)}</small>
      <p>${esc(s.summary.length > 140 ? s.summary.slice(0, 137) + "…" : s.summary)}</p>
    </a>`).join("");
}

function drawCats(skills) {
  const counts = {};
  skills.forEach((s) => (counts[s.category] = (counts[s.category] || 0) + 1));
  $("#home-cats").innerHTML = Object.keys(CATS).filter((c) => counts[c]).map((c) =>
    `<a class="chip" href="/menu?cat=${c}" style="--c:var(--c-${c})">${CATS[c][1]} ${CATS[c][0]} <small>${counts[c]}</small></a>`).join("");
}

async function start() {
  const r = await fetch("/data/skills.json", { cache: "no-cache" });
  const lib = r.ok ? await r.json() : {};
  const skills = lib.skills || [], sources = lib.sources || [];
  drawOrbit(sources);
  drawSpecials(skills);
  drawCats(skills);
}

/* Links set in config.js */
const CFG = window.CAFE || {};
document.querySelectorAll("[data-donate]").forEach((a) => {
  if (/^https:\/\//.test(CFG.donateUrl || "")) a.href = CFG.donateUrl; else a.hidden = true;
});
document.querySelectorAll("[data-removal]").forEach((a) => {
  if (/^https:\/\/github\.com\//.test(CFG.repoUrl || "")) a.href = CFG.repoUrl.replace(/\/$/, "") + "/issues/new?template=removal.yml";
  else a.hidden = true;
});

start().catch(() => ($("#orbit-note").textContent = "The menu is being restocked — please check back soon."));
