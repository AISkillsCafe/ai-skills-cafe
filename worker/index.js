/* AI Skills Café — Cloudflare Worker.
   Serves the static site in /site, plus one tiny endpoint for the footer's visitor count:
     GET  /api/visitors  -> {"visitors": N}
     POST /api/visitors  -> adds one, then {"visitors": N}
   The browser only POSTs the first time it opens the café (it remembers that itself).
   Nothing about the visitor is stored: no IP, no cookie, just one number. */
import { DurableObject } from "cloudflare:workers";

export class Counter extends DurableObject {
  async count(add) {
    let n = (await this.ctx.storage.get("visitors")) || 0;
    if (add) { n += 1; await this.ctx.storage.put("visitors", n); }
    return n;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/visitors") {
      if (request.method !== "GET" && request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      try {
        const counter = env.COUNTER.get(env.COUNTER.idFromName("site"));
        const visitors = await counter.count(request.method === "POST");
        return Response.json({ visitors }, { headers: { "cache-control": "no-store" } });
      } catch (e) {
        return Response.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
