import { readFileSync, writeFileSync } from 'node:fs';

const authorityPath = 'src/new-api-authority.ts';
let authority = readFileSync(authorityPath, 'utf8');

const helper = `
async function productEntitlements(client: import('pg').PoolClient, productCode: string) {
  const product = (await client.query('select * from license_products where code=$1 or id=$1 or slug=$1 limit 1', [productCode])).rows[0] as JsonObject | undefined;
  if (!product) throw new AuthorityError(400, \`Unknown product: \${productCode}\`, 'PRODUCT_NOT_FOUND');
  if (product.active === false || product.purchasable === false) throw new AuthorityError(409, 'Product is not available for licensing', 'PRODUCT_UNAVAILABLE');
  const components: JsonObject = {};
  if (product.component_key) components[String(product.component_key)] = true;
  const rules = (await client.query('select component_key,enabled from product_component_rules where product_id=$1 and enabled=true', [product.id])).rows as JsonObject[];
  for (const rule of rules) components[String(rule.component_key)] = rule.enabled !== false;
  const defaults = product.entitlement_defaults && typeof product.entitlement_defaults === 'object' ? product.entitlement_defaults : {};
  return { product, components, defaults };
}
`;
if (!authority.includes('async function productEntitlements(')) {
  const marker = 'export async function issueLicense(req: Request, input: JsonObject) {';
  if (!authority.includes(marker)) throw new Error('issueLicense marker not found');
  authority = authority.replace(marker, helper + '\n' + marker);
}
const old = '      const components = input.components && typeof input.components === "object" && !Array.isArray(input.components) ? input.components : {};';
const next = '      const requestedProduct = String(input.productCode || "orbitfs_base").trim();\n      const productData = await productEntitlements(client, requestedProduct);\n      const components = productData.components;';
if (authority.includes(old)) authority = authority.replace(old, next);
const oldInsert = '[randomUUID(), String(input.customerRef || ""), orderRef, String(input.productCode || "orbitfs_base"), input.expiresAt || null, maxInstallations, components, input.metadata || {}, hash(licenseKey), licenseKey.slice(-4), input.notes || null],';
const newInsert = '[randomUUID(), String(input.customerRef || ""), orderRef, String(productData.product.code), input.expiresAt || (productData.product.duration_days ? new Date(Date.now() + Number(productData.product.duration_days) * 86400000).toISOString() : null), maxInstallations || Number(productData.product.max_installations || 1), components, { ...(productData.defaults as JsonObject), ...(input.metadata as JsonObject || {}) }, hash(licenseKey), licenseKey.slice(-4), input.notes || null],';
if (authority.includes(oldInsert)) authority = authority.replace(oldInsert, newInsert);
const oldFulfill = '[orderRef, String(input.customerRef || ""), String(input.productCode || "orbitfs_base"), binding.id, { components }],';
const newFulfill = '[orderRef, String(input.customerRef || ""), String(productData.product.code), binding.id, { components, product: productData.product.code }],';
if (authority.includes(oldFulfill)) authority = authority.replace(oldFulfill, newFulfill);
writeFileSync(authorityPath, authority);

const serverPath = 'src/server.ts';
let server = readFileSync(serverPath, 'utf8');
if (!server.includes('async function productEntitlements(')) {
  const marker = 'async function issue(req: IncomingMessage, res: ServerResponse, authenticated = false) {';
  if (server.includes(marker)) {
    const helperServer = `\nasync function productEntitlements(client: import('pg').PoolClient, productCode: string) {\n  const product = (await client.query("select * from license_products where code=$1 or id=$1 or slug=$1 limit 1", [productCode])).rows[0] as JsonObject | undefined;\n  if (!product) throw new HttpError(400, \`Unknown product: \${productCode}\`);\n  if (product.active === false || product.purchasable === false) throw new HttpError(409, "Product is not available for licensing");\n  const components: JsonObject = {};\n  if (product.component_key) components[String(product.component_key)] = true;\n  const rules = (await client.query("select component_key,enabled from product_component_rules where product_id=$1 and enabled=true", [product.id])).rows as JsonObject[];\n  for (const rule of rules) components[String(rule.component_key)] = rule.enabled !== false;\n  return { product, components };\n}\n`;
    server = server.replace(marker, helperServer + marker);
    const oldS = '      const components = input.components && typeof input.components === "object" && !Array.isArray(input.components) ? input.components : {};';
    if (server.includes(oldS)) server = server.replace(oldS, '      const requestedProduct = String(input.productCode || "orbitfs_base").trim();\n      const productData = await productEntitlements(client, requestedProduct);\n      const components = productData.components;');
  }
}
writeFileSync(serverPath, server);
console.log('Product authority sync patch applied');
