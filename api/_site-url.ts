// SITE_URL is only ever used as a dummy base so `new URL(req.url, base)` can
// resolve a relative request path — its host never actually matters to any
// caller. But the native `new URL()` constructor throws if the base isn't a
// fully-qualified absolute URL (for example if SITE_URL is set in Vercel as
// "incendiarynetworks.cc" instead of "https://incendiarynetworks.cc"), and an
// uncaught throw here takes down every route that touches it. This normalizes
// whatever is configured into something that can never throw, and is shared
// so every function that parses SITE_URL behaves the same way.
export function siteUrlBase(): string {
  const raw = String(process.env.SITE_URL || "").trim();
  const candidate = raw ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : "https://example.invalid";
  try { return new URL(candidate).origin; } catch { return "https://example.invalid"; }
}
