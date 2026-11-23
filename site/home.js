"use strict";
/* Welcome page: random sources orbiting the cup, today's specials, categories. */
const CATS = {
  docs: ["Documents & Office", "📄"], code: ["Coding & Engineering", "🛠️"], design: ["Design & Creative", "🎨"],
  data: ["Data & Research", "📊"], science: ["Science", "🔬"], writing: ["Writing & Marketing", "✍️"],
  workflow: ["Planning & Workflow", "🧭"], other: ["Everything else", "✨"],
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s) => document.querySelector(s);
/* The headline: one of four café lines, picked at random on each visit (never the same twice in a row). */
const HEADLINES = [
  ["Stimulate Your Creativity", "with Rich AI Skills"],
  ["Enhance Your Grind", "with Rich AI Skills"],
  ["Amp Up Your Code", "with Robust AI Skills"],
  ["Elevate Your Original Grind", "with a Shot of AI Skills"],
];
(function pickHeadline() {
  let last = -1, i;
  try { last = Number(localStorage.getItem("aiskillscafe.headline")); } catch (e) {}
  do { i = Math.floor(Math.random() * HEADLINES.length); } while (i === last && HEADLINES.length > 1);
  try { localStorage.setItem("aiskillscafe.headline", String(i)); } catch (e) {}
  const [top, em] = HEADLINES[i];
  const sr = document.getElementById("tagline-text");
  if (sr) sr.textContent = top + " " + em;
  // shrink a line's type only when it's too long for its curve
  [["arch-top", top, "arch-outer"], ["arch-em", em, "arch-inner"]].forEach(([id, text, pathId]) => {
    const tp = document.getElementById(id), path = document.getElementById(pathId);
    if (!tp || !path) return;
    tp.textContent = text;
    const t = tp.parentNode;
    t.style.fontSize = "";
    try {
      const room = path.getTotalLength() * 0.97, need = t.getComputedTextLength();
      if (need > room) t.style.fontSize = (parseFloat(getComputedStyle(t).fontSize) * room / need).toFixed(1) + "px";
    } catch (e) {}
  });
})();

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
  orbit.innerHTML = picked.map((s) => `
    <a class="sat" href="/menu?source=${encodeURIComponent(s.repo)}" title="${esc(s.repo)} — ${s.skills} skill${s.skills === 1 ? "" : "s"}">
      <img src="${esc(s.avatar)}&s=96" alt="" width="54" height="54" loading="lazy"><small>${esc(s.owner)}</small>
    </a>`).join("");
  spin($("#orbit-stage"), [...orbit.children]);
}

/* A tilted orbit: pictures swing in front of the cup (bigger, brighter) and behind it (smaller, dimmer). */
function spin(stage, sats) {
  const PERIOD = 70000;                                // ms per lap
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const back = $("#track-back"), front = $("#track-front");
  let angle = 0, last = performance.now(), paused = false, resume = 0, running = false;
  // Pause while pointed at or focused. A touch has no hover, so after a tap the ring stays still a few seconds.
  const hold = () => { clearTimeout(resume); paused = true; };
  const release = (e) => { clearTimeout(resume); resume = setTimeout(() => (paused = false), e && e.pointerType === "touch" ? 4000 : 0); };
  stage.addEventListener("pointerenter", hold);
  stage.addEventListener("pointerdown", hold);
  stage.addEventListener("pointerleave", release);
  stage.addEventListener("focusin", hold);
  stage.addEventListener("focusout", release);

  function place() {
    const w = stage.clientWidth, h = stage.clientHeight;
    const cx = w / 2, cy = h * 0.55, rx = w / 2 - (w < 480 ? 30 : 46), ry = rx * 0.5;
    const arc = (sweep) => `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 ${sweep} ${cx + rx} ${cy}`;
    back.setAttribute("d", arc(1)); front.setAttribute("d", arc(0));
    sats.forEach((el, i) => {
      const t = angle + (i * 2 * Math.PI) / sats.length;
      const depth = Math.sin(t);                        // -1 = far side, 1 = nearest
      const near = (depth + 1) / 2;
      const x = cx + rx * Math.cos(t), y = cy + ry * depth;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(0.62 + 0.46 * near).toFixed(3)})`;
      el.style.opacity = (0.4 + 0.6 * near).toFixed(2);
      el.style.zIndex = depth > 0 ? 4 : 1;              // the cup sits at 2, the front of the track at 3
      el.classList.toggle("far", depth < -0.3);
    });
  }
  function frame(now) {
    if (still.matches) { running = false; place(); return; }   // reduced motion: draw once, no loop
    if (!paused) angle = (angle + ((now - last) / PERIOD) * 2 * Math.PI) % (2 * Math.PI);
    last = now;
    place();
    requestAnimationFrame(frame);
  }
  const go = () => { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } };
  still.addEventListener("change", go);
  addEventListener("resize", () => still.matches && place());
  angle = Math.PI / 2 - Math.PI / sats.length;          // start with a picture front and centre
  go();
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
  if (!r.ok) throw new Error(r.status);
  const lib = await r.json();
  const skills = lib.skills || [], sources = lib.sources || [];
  if (!skills.length) throw new Error("empty");
  drawOrbit(sources);
  drawSpecials(skills);
  drawCats(skills);
  $("#specials-section").hidden = !$("#specials").children.length;   // sections appear only once they have something in them
  $("#cats-section").hidden = !$("#home-cats").children.length;
}

/* Links set in config.js */
const CFG = window.CAFE || {};
document.querySelectorAll("[data-donate]").forEach((a) => {
  if (/^https:\/\//.test(CFG.donateUrl || "")) a.href = CFG.donateUrl;
  else { a.hidden = true; const box = a.closest(".support"); if (box) box.hidden = true; }
});
document.querySelectorAll("[data-removal]").forEach((a) => {
  if (/^https:\/\/github\.com\//.test(CFG.repoUrl || "")) a.href = CFG.repoUrl.replace(/\/$/, "") + "/issues/new?template=removal.yml";
  else a.hidden = true;
});

start().catch(() => {
  $("#orbit-stage").hidden = true;
  $("#orbit-note").innerHTML = 'We couldn’t load today’s creators. The full menu may still open — <a href="/menu">try the menu</a>, or refresh this page in a moment.';
});
