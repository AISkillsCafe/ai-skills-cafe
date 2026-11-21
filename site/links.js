/* Footer and page links set in config.js (used by pages without their own script). */
(function () {
  var c = window.CAFE || {};
  document.querySelectorAll("[data-donate]").forEach(function (a) {
    if (/^https:\/\//.test(c.donateUrl || "")) a.href = c.donateUrl; else a.hidden = true;
  });
  document.querySelectorAll("[data-removal]").forEach(function (a) {
    if (/^https:\/\/github\.com\//.test(c.repoUrl || "")) a.href = c.repoUrl.replace(/\/$/, "") + "/issues/new?template=removal.yml";
    else a.replaceWith(document.createTextNode(a.textContent));
  });
})();
