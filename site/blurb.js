"use strict";
/* A one-line, person-readable blurb for a skill's detail sheet. */
(function () {
  /* Author descriptions are written for the AI ("Trigger whenever…", "For X, see y."), so pick the
     sentence that reads best for a person and trim it to one clause. */
  const JUNK = /^(for [^.]*,\s*see\b|see\b|do this\b|trigger\b|invoke\b|always\b|never\b|important\b|note:|\.{0,2}\/)/i;
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  function tidy(t) {
    return t
      .replace(/^this (includes|means)(\s+any task where the user wants to)?\s*:?\s*/i, "")
      .replace(/^use (this skill )?(when|whenever|any time|anytime)\s+(the user|you|users?)\s+(wants?|needs?|asks?)\s+to\s+/i, "Helps you ")
      .replace(/^use (this skill )?(when|whenever|any time|anytime|for)\s+/i, "For ")
      .replace(/^when (the user|you|users?) (wants?|needs?) to\s+/i, "Helps you ")
      .replace(/^when (the user|you|users?) (wants?|needs?)\s+/i, "For when you want ")
      .replace(/,?\s+or asks?\b[\s\S]*$/i, "")
      .split(/\s*[:;]\s+|\s+[—–]\s+/)[0]
      .replace(/[\s,]+$/, "");
  }
  function skillBlurb(s) {
    const own = String(s.summary || "").trim();
    if (own.length >= 30 && !JUNK.test(own) && !/^this (includes|means)/i.test(own)) return own;
    const sentences = String(s.description || "").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
    const pool = [own, ...sentences].filter((x) => x && !JUNK.test(x));
    for (const x of pool) {
      const t = tidy(x);
      if (t.length >= 20) return cap(/[.!?)]$/.test(t) ? t : t + ".");
    }
    return "No description from the author yet — open it to see the instructions.";
  }
  window.skillBlurb = skillBlurb;
})();
