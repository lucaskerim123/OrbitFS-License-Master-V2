import { NextRequest, NextResponse } from "next/server";
import { licenseMasterConfigStatus, licenseMasterProducts, licenseMasterRevision, licenseMasterSettings } from "@/lib/license-master";

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const supabaseAnon = String(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "");
const adminEmails = new Set(String(process.env.ADMIN_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean));

async function isAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ") || !supabaseUrl || !supabaseAnon) return false;
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseAnon, authorization: auth }, cache: "no-store" });
  if (!r.ok) return false;
  const user = await r.json().catch(() => ({} as any));
  const metadata = user?.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
  return adminEmails.has(String(user?.email || "").toLowerCase()) || metadata.role === "admin" || metadata.role === "superadmin";
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "Administrator authentication is required" }, { status: 401 });
  const config = licenseMasterConfigStatus();
  if (!config.billingConfigured) return NextResponse.json({ ok: false, config, error: "BILLING_API_TOKEN is not configured on the Billing Store" }, { status: 503 });
  try {
    const [revision, products, settings] = await Promise.all([licenseMasterRevision(), licenseMasterProducts(), licenseMasterSettings()]);
    return NextResponse.json({ ok: true, authority: "license-master", config, revision, products, settings }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, authority: "license-master", config, error: error instanceof Error ? error.message : "License Master request failed" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
