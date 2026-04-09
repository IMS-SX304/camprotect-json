/**
 * generate-data.js
 * Extraction Webflow API v2 → data.json
 * Compatible barre de recherche Fuse.js + planner camprotect
 */

import fetch from 'node-fetch';
import fs from 'fs';

const TOKEN         = process.env.WEBFLOW_TOKEN;
const PRODUCTS_COL  = '66e1f58c28ec496d75b43155';
const SKUS_COL      = '66e1f58c28ec496d75b43159';

// API v2
const BASE = 'https://api.webflow.com/v2';
const H = {
  Authorization: `Bearer ${TOKEN}`,
  'accept-version': '1.0.0',
  'Content-Type': 'application/json'
};

// ─── Tables de référence ──────────────────────────────────────────────────
const FABS = {
  '9b270d1e370c9f1ad85ecf2d78824810': 'AJAX',
  'a879d2383bdc98f01675f5bea9484afa': 'HIKVISION',
  '3edbd4b348e5396bb201cd79991299ee': 'DAHUA',
  '90d7b7af34227ce25c212b95c2cbd148': 'IZYX',
  '0772a87218dde4f2ba6140dbc2bf38ed': 'SOCAMONT',
  '520693cec041771ec210c6b3a393df65': 'ELBAC',
  '6feec809f4d67cacfbb91f391513bfbb': 'INFOSEC',
  '8092c4d071d4fbf62ed2bf7d499d58e2': 'UBIQUITI',
  '4f57efdfcce4116e526809fdb7bec0c9': 'MBG',
};

const ENVS = {
  'e381f94f0a53e6a89704ab95808f3c7e': 'Extérieur',
  '418b9e69feac8920782ca9ed7d1f9707': 'Intérieur',
};

const PLANNER_MAP_SLUGS = {
  hub:    'ajax-hub-2-4g-blanc',
  hub_p:  'ajax-hub-2-plus-blanc',
  hub_2g: 'ajax-hub-2-2g-blanc',
  mp:     'motionprotect-blanc',
  mp_p:   'ajax-motionprotect-plus-blanc',
  mp_c:   'ajax-motionprotect-curtain-blanc',
  mp_o:   'ajax-motionprotect-outdoor-blanc',
  mc:     'ajax-motioncam-blanc',
  mc_p:   'ajax-motioncam-phod-blanc',
  mc_o:   'ajax-motioncam-outdoor-blanc',
  mc_op:  'ajax-motioncam-outdoor-phod-blanc',
  cb:     'ajax-combiprotect-blanc',
  cu:     'ajax-curtain-outdoor-blanc',
  cu2:    'ajax-dualcurtain-outdoor-blanc',
  dp:     'doorprotect-blanc',
  dp_p:   'ajax-doorprotect-plus-blanc',
  gp:     'ajax-glassprotect-blanc',
  fp:     'ajax-fireprotect-blanc',
  fp_p:   'fireprotect-plus-blanc',
  fp2:    'ajax-fireprotect-2-rb-blanc',
  hs:     'ajax-homesiren-blanc',
  ss:     'ajax-streetsiren-blanc',
  kp:     'ajax-keypad-blanc',
  kp_p:   'ajax-keypad-plus-blanc',
  kp_ts:  'ajax-keypad-touchscreen-blanc',
  bc28:   'ajax-bulletcam-blanche-5mp-2-8mm',
  bc4:    'camera-bullet-ajax-5mp-4mm-blanche',
  dc28:   'camera-dome-ajax-domecam-mini-5mp-2-8mm-blanche',
  dc4:    'camera-dome-ajax-domecam-mini-5mp-4mm-blanche',
  tc28:   'camera-tourelle-ajax-turretcam-5mp-2-8mm-blanche',
  tc4:    'camera-tourelle-ajax-turretcam-5mp-4mm-blanche',
  mt:     'ajax-multitransmitter-blanc',
  rex:    'ajax-rex-2-blanc',
};

// ─── Pagination API v2 ────────────────────────────────────────────────────
async function fetchAll(collectionId) {
  let items = [];
  let offset = 0;
  while (true) {
    const r = await fetch(
      `${BASE}/collections/${collectionId}/items?limit=100&offset=${offset}`,
      { headers: H }
    );
    if (!r.ok) throw new Error(`Webflow API error ${r.status}: ${await r.text()}`);
    const d = await r.json();
    const batch = d.items || [];
    items = items.concat(batch);
    const total = d.pagination?.total ?? items.length;
    console.log(`  ${collectionId.slice(-6)} offset=${offset} → ${items.length}/${total}`);
    if (items.length >= total || batch.length === 0) break;
    offset += 100;
  }
  return items;
}

// ─── Formatage prix (centimes → "257,22") ────────────────────────────────
function fmtPrice(val) {
  if (!val && val !== 0) return '';
  return (val / 100).toFixed(2).replace('.', ',');
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  if (!TOKEN) throw new Error('WEBFLOW_TOKEN manquant');
  console.log('📥 Récupération des produits (API v2)...');

  const [rawProducts, rawSkus] = await Promise.all([
    fetchAll(PRODUCTS_COL),
    fetchAll(SKUS_COL),
  ]);
  console.log(`✓ ${rawProducts.length} produits, ${rawSkus.length} SKUs`);

  // Index SKUs par product ID
  const skuByProduct = {};
  for (const sku of rawSkus) {
    const pid = sku.fieldData?.product;
    if (pid) {
      skuByProduct[pid] = skuByProduct[pid] || [];
      skuByProduct[pid].push(sku);
    }
  }

  const products = [];
  const slugIndex = {};

  for (const p of rawProducts) {
    if (p.isArchived || p.isDraft) continue;
    const fd = p.fieldData;
    const pid = p.id;
    const skus = skuByProduct[pid] || [];

    let priceRaw = null, imgUrl = '';
    for (const s of skus) {
      const sfd = s.fieldData;
      if (!priceRaw && sfd.price?.value) priceRaw = sfd.price.value;
      if (!imgUrl && sfd['main-image']?.url) imgUrl = sfd['main-image'].url;
      if (priceRaw && imgUrl) break;
    }

    // Correction prix aberrant
    if (priceRaw > 100000) {
      console.warn(`  ⚠ Prix suspect "${fd.name}": ${priceRaw} → corrigé`);
      priceRaw = priceRaw / 100;
    }

    const slug    = fd.slug || '';
    const brand   = FABS[fd.fabricants] || '';
    const env     = ENVS[fd.environnement] || '';
    const couleur = fd.couleur === 'c4ace7b5c9fa4b41753e2a21972d9f72' ? 'Blanc'
                  : fd.couleur === '192fa2d4339dc5af00fe9a51e72bea99' ? 'Noir' : '';
    const micro   = fd['micro-integre-2'] === 'b171d95294a5f81060c177713e8b0183' ? 'Oui'
                  : fd['micro-integre-2'] === '93cc9946ca37cb462fe7f576a8617dd2' ? 'Non' : '';

    const product = {
      // Fuse.js search bar
      title:         fd.name || '',
      url:           `https://www.camprotect.fr/product/${slug}`,
      image:         imgUrl,
      description:   fd['description-mini'] || fd.description || '',
      brand, productType: fd['type-de-produit'] || '',
      cameraForm:    fd['forme-de-la-camera'] || '',
      compatibilite: fd['compatibilite-cameras'] || '',
      alimentation:  fd['alimentation-de-la-camera'] || '',
      communication: fd['module-de-communication'] || fd.raccordement || '',
      couleur, environnement: env, iacamera: fd['intelligence-artificielle-camera'] || '',
      micro, technologie: fd['technologie-de-camera'] || '',
      productref:    fd['product-reference'] || fd['code-fabricant'] || '',
      altwords:      fd.altword || '',
      price:         fmtPrice(priceRaw),
      categorie1: '', categorie2: '',
      // Planner
      slug, serie: fd.serie || '', ip: fd['indice-de-protection---ik'] || '',
      peripheriques_max: fd['nombre-des-peripheriques-max'] || '',
      acoustique_db: fd['puissance-accoustique'] || '',
      resolution: fd.resolution || '', ir_portee: fd['ir-led'] || '',
      canaux: fd['nombre-de-canaux'] || '', compression: fd['compression-video'] || '',
      garantie: fd['garantie-du-produit'] || '',
      prix_ht: priceRaw ? Math.round(priceRaw) / 100 : null,
    };

    for (const k of Object.keys(product)) {
      if (product[k] === null || product[k] === undefined) product[k] = '';
    }
    products.push(product);
    if (slug) slugIndex[slug] = product;
  }

  console.log(`✓ ${products.length} produits actifs`);

  // Planner map
  const plannerMap = {};
  for (const [key, slug] of Object.entries(PLANNER_MAP_SLUGS)) {
    const prod = slugIndex[slug];
    if (prod) {
      plannerMap[key] = {
        slug, name: prod.title, prix_ht: prod.prix_ht, image: prod.image,
        description: prod.description, type: prod.productType,
        ip: prod.ip, environnement: prod.environnement,
        acoustique_db: prod.acoustique_db, peripheriques_max: prod.peripheriques_max,
        url: prod.url,
      };
      for (const k of Object.keys(plannerMap[key])) {
        if (!plannerMap[key][k] && plannerMap[key][k] !== 0) delete plannerMap[key][k];
      }
    } else {
      console.warn(`  ⚠ Clé planner "${key}" introuvable: ${slug}`);
    }
  }

  const resolved = Object.keys(plannerMap).length;
  console.log(`✓ Planner map: ${resolved}/${Object.keys(PLANNER_MAP_SLUGS).length} clés`);

  const output = {
    meta: { total: products.length, generated: new Date().toISOString(), source: 'camprotect.fr Webflow CMS' },
    planner_map: plannerMap,
    products,
  };

  fs.writeFileSync('data.json', JSON.stringify(output, null, 0), 'utf-8');
  const size = Math.round(fs.statSync('data.json').size / 1024);
  console.log(`✅ data.json — ${size}KB · ${products.length} produits · ${resolved} clés planner`);
}

main().catch(e => { console.error('❌ Erreur:', e.message); process.exit(1); });
