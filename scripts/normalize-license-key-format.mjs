import { readFileSync, writeFileSync } from 'node:fs';

const files = [
  'src/server.ts',
  'src/admin-console.ts',
  'src/new-api-authority.ts',
];

for (const file of files) {
  let source = readFileSync(file, 'utf8');
  source = source.replaceAll('`OFS-', '`ORBITFS-');
  source = source.replaceAll('return `OFS-', 'return `ORBITFS-');

  if (file === 'src/server.ts') {
    const controlStart = source.indexOf('async function control(');
    const adminControlStart = source.indexOf('async function adminControl(', controlStart);
    if (controlStart >= 0 && adminControlStart > controlStart) {
      const replacement = `async function control(req: IncomingMessage, res: ServerResponse, id: string, authenticated = false) {
  if (!authenticated && !allowed(req, ["master", "billing"])) return json(res, 401, { error: "Unauthorized" });
  const input = await body(req);
  const action = String(input.action || "").trim().toLowerCase();
  if (!["activate", "suspend", "unlock", "terminate", "rotate"].includes(action)) return json(res, 400, { error: "Invalid action" });
  const existing = (await query("select * from license_bindings where id=$1 and archived_at is null limit 1", [id])).rows[0] as JsonObject | undefined;
  if (!existing) return json(res, 404, { error: "License not found" });

  if (action === "rotate") {
    const key = newLicenseKey();
    await query("update license_bindings set license_key_hash=$1,license_key_last4=$2,updated_at=now() where id=$3 and archived_at is null", [hash(key), key.slice(-4), id]);
    await query("insert into license_key_delivery(binding_id,customer_ref,license_key) values($1,$2,$3)", [id, String(existing.customer_ref || ""), key]);
    await audit("licence", id, "admin.rotate", actorFrom(req), { licenseKeyLast4: key.slice(-4) });
    return json(res, 200, { ok: true, id, action, status: String(existing.status || "active"), licenseKey: key, key });
  }

  if (action === "activate") {
    await query("update license_bindings set status='active',desired_state='active',remote_state='active',updated_at=now() where id=$1 and archived_at is null", [id]);
  } else if (action === "suspend") {
    await query("update license_bindings set status='suspended',desired_state='suspended',remote_state='suspended',updated_at=now() where id=$1 and archived_at is null", [id]);
    await query("update license_installations set status='disabled',locked_at=coalesce(locked_at,now()) where binding_id=$1", [id]);
  } else if (action === "terminate") {
    await query("update license_bindings set status='terminated',desired_state='terminated',remote_state='terminated',updated_at=now() where id=$1 and archived_at is null", [id]);
    await query("update license_installations set status='disabled',locked_at=coalesce(locked_at,now()) where binding_id=$1", [id]);
  } else {
    await query("update license_installations set status='active',locked_at=null,last_seen_at=now() where binding_id=$1", [id]);
    await query("update license_bindings set status='active',desired_state='active',remote_state='active',updated_at=now() where id=$1 and archived_at is null", [id]);
  }

  await audit("licence", id, \`admin.\${action}\`, actorFrom(req), { action });
  return json(res, 200, { ok: true, id, action, status: action === "unlock" || action === "activate" ? "active" : action === "suspend" ? "suspended" : "terminated" });
}

`;
      source = source.slice(0, controlStart) + replacement + source.slice(adminControlStart);
    }
  }

  if (file === 'src/new-api-authority.ts') {
    source = source.replace(
      '  const orderRef = String(input.orderRef || req.headers.get("x-orbitfs-order-ref") || "").trim();\n  if (!orderRef || orderRef.length > 200) throw new AuthorityError(400, "orderRef is required", "INVALID_REQUEST");',
      '  const orderRef = String(input.orderRef || req.headers.get("x-orbitfs-order-ref") || "").trim();\n  const customerRef = String(input.customerRef || "").trim();\n  if (!orderRef || orderRef.length > 200) throw new AuthorityError(400, "orderRef is required", "INVALID_REQUEST");\n  if (!customerRef || customerRef.length > 200) throw new AuthorityError(400, "customerRef is required", "INVALID_CUSTOMER");'
    );
    source = source.replace(
      '    if (existing) {\n      binding = existing;',
      '    if (existing) {\n      if (String(existing.customer_ref || "") !== customerRef) throw new AuthorityError(409, "Order reference is already bound to a different customer", "ORDER_CUSTOMER_MISMATCH");\n      if (String(existing.product_code || "") !== String(input.productCode || "orbitfs_base")) throw new AuthorityError(409, "Order reference is already bound to a different product", "ORDER_PRODUCT_MISMATCH");\n      binding = existing;'
    );
    source = source.replaceAll('String(input.customerRef || "")', 'customerRef');
  }

  if (file === 'src/admin-console.ts') {
    source = source.replace(
      "  const orderRef = String(input.orderRef || '').trim();\n  if (!orderRef || orderRef.length > 200) return json({ error: 'Order reference is required' }, 400);",
      "  const orderRef = String(input.orderRef || '').trim();\n  const customerRef = String(input.customerRef || '').trim();\n  if (!orderRef || orderRef.length > 200) return json({ error: 'Order reference is required' }, 400);\n  if (!customerRef || customerRef.length > 200) return json({ error: 'Customer external ID is required' }, 400);"
    );
    source = source.replace(
      "    if (existing) {\n      binding = existing;",
      "    if (existing) {\n      if (String(existing.customer_ref || '') !== customerRef) return json({ error: 'Order reference is already bound to a different customer' }, 409);\n      if (String(existing.product_code || '') !== String(input.productCode || 'orbitfs_base')) return json({ error: 'Order reference is already bound to a different product' }, 409);\n      binding = existing;"
    );
    source = source.replaceAll("String(input.customerRef || '')", "customerRef");
  }

  writeFileSync(file, source);
}

console.log('OrbitFS license key format, license control, and issue contract normalized');
