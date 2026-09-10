import type { Env } from "./types";

const enc = new TextEncoder();
const b64 = (v: ArrayBuffer | Uint8Array) => {
  const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : v;
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};

export async function sha256(value: string) { return b64(await crypto.subtle.digest("SHA-256", enc.encode(value))); }
function pemBytes(pem: string) { const clean=pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""); return Uint8Array.from(atob(clean), c=>c.charCodeAt(0)); }

export async function signEntitlement(payload: Record<string, unknown>, env: Env) {
  const pem=atob(env.ENTITLEMENT_PRIVATE_KEY_B64);if(!pem)throw new Error("ENTITLEMENT_PRIVATE_KEY_B64 is not configured");
  const key=await crypto.subtle.importKey("pkcs8",pemBytes(pem),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const h=b64(enc.encode(JSON.stringify({alg:"RS256",typ:"JWT"}))),p=b64(enc.encode(JSON.stringify(payload))),input=`${h}.${p}`;
  const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc.encode(input));return `${input}.${b64(sig)}`;
}

export async function publicSigningPem(env: Env) {
  const encoded=String(env.ENTITLEMENT_PRIVATE_KEY_B64||"").trim();if(!encoded)throw new Error("ENTITLEMENT_PRIVATE_KEY_B64 is not configured");
  const key=await crypto.subtle.importKey("pkcs8",pemBytes(atob(encoded)),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const exported=await crypto.subtle.exportKey("spki",key);const spki=exported as ArrayBuffer;
  const raw=btoa(String.fromCharCode(...new Uint8Array(spki))).replace(/(.{64})/g,"$1\n");
  return `-----BEGIN PUBLIC KEY-----\n${raw}\n-----END PUBLIC KEY-----`;
}
