/* Footer and page links set in config.js, plus the visitor count. Loaded on every page. */
(function () {
  var c = window.CAFE || {};
  var repo = /^https:\/\/github\.com\//.test(c.repoUrl || "") ? c.repoUrl.replace(/\/$/, "") : "";
  document.querySelectorAll("[data-donate]").forEach(function (a) {
    if (/^https:\/\//.test(c.donateUrl || "")) a.href = c.donateUrl;
    else { a.hidden = true; var box = a.closest(".support"); if (box) box.hidden = true; }
  });
  [["[data-removal]", "removal.yml"], ["[data-feature]", "feature.yml"]].forEach(function (pair) {
    document.querySelectorAll(pair[0]).forEach(function (a) {
      if (repo) a.href = repo + "/issues/new?template=" + pair[1];
      else a.hidden = true;
    });
  });

  /* Visitor count: a browser is counted once, the first time it opens the café.
     Nothing about the visitor is sent or stored, just "one more". */
  var box = document.getElementById("visits");
  if (!box || !window.fetch) return;
  var KEY = "aiskillscafe.counted", counted = false;
  try { counted = localStorage.getItem(KEY) === "1"; } catch (e) { counted = true; }   // no storage: just show the count
  fetch("/api/visitors", { method: counted ? "GET" : "POST", cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      if (typeof d.visitors !== "number" || d.visitors < 1) return;
      if (!counted) try { localStorage.setItem(KEY, "1"); } catch (e) {}
      box.textContent = d.visitors.toLocaleString("en-US") + (d.visitors === 1 ? " visitor" : " visitors");
      box.title = "Browsers that have visited the café. Each one is counted once; no cookies, nothing about you stored.";
      box.hidden = false;
    })
    .catch(function () {});
})();
