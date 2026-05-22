/**
 * generate-feed.js — Flux Google Shopping pour camprotect.fr
 * v2 — lit data.products[] (307 produits) + planner_map en complément
 *
 * Usage : node generate-feed.js
 * Sortie : feed.xml (Google Merchant Center — RSS 2.0 + namespace g:)
 */

const https = require("https");
const fs = require("fs");

const JSON_URL  = "https://ims-sx304.github.io/camprotect-json/data.json";
const OUTPUT    = "feed.xml";
const STORE_URL = "https://www.camprotect.fr";

// ── Catégories Google Product Taxonomy ──────────────────────────────────────
function getCategory(p) {
  const t = (p.productType || p.type || "").toLowerCase();
  const n = (p.title || p.name || "").toLowerCase();
  if (t.includes("caméra") || t.includes("camera") || n.includes("cam") ||
      n.includes("nvr") || n.includes("dvr") || n.includes("enregistreur")) return "2935";
  if (t.includes("pack") || t.includes("kit") ||
      t.includes("centrale") || n.includes("hub") || n.includes("starterkit")) return "1301";
  return "222";
}

// ── Marque ───────────────────────────────────────────────────────────────────
function getBrand(p) {
  if (p.brand && p.brand.trim()) return p.brand.trim();
  const n = (p.title || p.name || "").toLowerCase();
  if (n.includes("hikvision")) return "Hikvision";
  if (n.includes("dahua"))     return "Dahua";
  return "Ajax Systems";
}

// ── Prix TTC ─────────────────────────────────────────────────────────────────
function getTTC(p) {
  let ht = parseFloat(p.prix_ht);
  if (!ht || isNaN(ht)) {
    const raw = String(p.price || "").replace(/\s/g, "").replace(",", ".");
    ht = parseFloat(raw);
  }
  if (!ht || isNaN(ht) || ht <= 0) return null;
  return (ht * 1.2).toFixed(2);
}

// ── Identifiant produit ───────────────────────────────────────────────────────
function getId(p) {
  return p.sku_id || p.slug || p.id || null;
}

// ── Disponibilité ─────────────────────────────────────────────────────────────
function getAvailability(p) {
  const stock = (p.stock || p.availability || "").toLowerCase();
  if (stock.includes("rupture") || stock === "out_of_stock") return "out_of_stock";
  return "in_stock";
}

// ── Échappement XML ───────────────────────────────────────────────────────────
function esc(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── Générer un <item> ─────────────────────────────────────────────────────────
function buildItem(p) {
  const id    = getId(p);
  const price = getTTC(p);
  const image = p.image || p.image_url || "";
  const link  = p.url || (p.slug ? `${STORE_URL}/product/${p.slug}` : "");
  const title = (p.title || p.name || "").slice(0, 150);
  const desc  = (p.description || `${title} — camprotect.fr`).slice(0, 4990);

  if (!id)    return { skip: `id manquant — ${title}` };
  if (!price) return { skip: `prix invalide — ${title}` };
  if (!link)  return { skip: `URL manquante — ${id}` };
  if (!image) return { skip: `image manquante — ${id}` };

  const brand    = getBrand(p);
  const category = getCategory(p);
  const avail    = getAvailability(p);
  const mpn      = p.code_fabricant || p.productref || "";
  const gtin     = p.ean || p.gtin || "";
  const color    = p.couleur || "";

  return {
    xml: `
    <item>
      <g:id>${esc(id)}</g:id>
      <g:title>${esc(title)}</g:title>
      <g:description>${esc(desc)}</g:description>
      <g:link>${esc(link)}</g:link>
      <g:image_link>${esc(image)}</g:image_link>
      <g:condition>new</g:condition>
      <g:availability>${avail}</g:availability>
      <g:price>${price} EUR</g:price>
      <g:brand>${esc(brand)}</g:brand>
      <g:google_product_category>${category}</g:google_product_category>
      <g:identifier_exists>${gtin ? "true" : "false"}</g:identifier_exists>${gtin ? `\n      <g:gtin>${esc(gtin)}</g:gtin>` : ""}${mpn ? `\n      <g:mpn>${esc(mpn)}</g:mpn>` : ""}${color ? `\n      <g:color>${esc(color)}</g:color>` : ""}
      <g:adult>false</g:adult>
    </item>`
  };
}

// ── Extraire tous les produits ────────────────────────────────────────────────
function extractProducts(data) {
  const seen = new Set();
  const all  = [];

  // 1. Tableau products[] — source principale (307 produits, champs riches)
  if (Array.isArray(data.products)) {
    for (const p of data.products) {
      const key = getId(p);
      if (key && !seen.has(key)) { seen.add(key); all.push(p); }
    }
  }

  // 2. planner_map — complément pour les produits individuels non listés
  if (data.planner_map && typeof data.planner_map === "object") {
    for (const p of Object.values(data.planner_map)) {
      const key = p.slug || p.id;
      if (key && !seen.has(key)) { seen.add(key); all.push(p); }
    }
  }

  return all;
}

// ── Fetch JSON ────────────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(new Error("JSON invalide : " + e.message)); }
      });
    }).on("error", reject);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log("⏳ Récupération du catalogue...");
  let data;
  try {
    data = await fetchJSON(JSON_URL);
  } catch (e) {
    console.error("❌ Impossible de récupérer le JSON :", e.message);
    process.exit(1);
  }

  const products = extractProducts(data);
  console.log(`\n📦 ${products.length} produits extraits du JSON`);
  console.log(`   └ products[] : ${Array.isArray(data.products) ? data.products.length : 0}`);
  console.log(`   └ planner_map : ${data.planner_map ? Object.keys(data.planner_map).length : 0} (déduplication appliquée)`);

  const items   = [];
  const skipped = [];

  for (const p of products) {
    const result = buildItem(p);
    if (result.xml)  items.push(result.xml);
    if (result.skip) skipped.push(result.skip);
  }

  if (skipped.length) {
    console.log(`\n⚠️  ${skipped.length} produit(s) ignoré(s) :`);
    skipped.slice(0, 20).forEach(s => console.log(`   → ${s}`));
    if (skipped.length > 20) console.log(`   ... et ${skipped.length - 20} autres`);
  }

  console.log(`\n✅ ${items.length} produits valides → feed.xml`);

  const now = new Date().toUTCString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Camprotect — Vidéosurveillance et alarmes</title>
    <link>${STORE_URL}</link>
    <description>Spécialiste Ajax Systems, Hikvision et Dahua en France</description>
    <lastBuildDate>${now}</lastBuildDate>
    ${items.join("\n")}
  </channel>
</rss>`;

  fs.writeFileSync(OUTPUT, xml, "utf8");
  const kb = (Buffer.byteLength(xml, "utf8") / 1024).toFixed(1);
  console.log(`\n🎉 feed.xml généré — ${items.length} produits — ${kb} Ko`);
  console.log(`\n📋 Déploiement :`);
  console.log(`   git add feed.xml && git commit -m "fix: flux complet ${items.length} produits" && git push`);
  console.log(`\n📋 Puis dans GMC :`);
  console.log(`   Products → Flux → forcer la récupération → vérifier l'approbation`);
})();
