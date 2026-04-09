# camprotect-json

Catalogue produits CamProtect — mis à jour automatiquement via GitHub Actions.

## 🔄 Mettre à jour le catalogue

1. Va sur [GitHub Actions](https://github.com/IMS-SX304/camprotect-json/actions)
2. Clique sur **"🔄 Mettre à jour data.json"**
3. Clique sur **"Run workflow"** → **"Run workflow"**
4. Attends ~30 secondes → c'est fait ✅

## 📦 Structure du JSON

```json
{
  "meta": { "total": 248, "generated": "...", "source": "..." },
  "planner_map": { "hub": {...}, "mp": {...}, ... },
  "products": [ { "title": "...", "url": "...", ... } ]
}
```

- **`products`** — tableau plat utilisé par la barre de recherche Fuse.js
- **`planner_map`** — mapping clé→prix pour le planificateur

## ⚙️ Configuration initiale

Dans les **Settings → Secrets** du repo, ajouter :
- `WEBFLOW_TOKEN` : ton token API Webflow (Settings → Integrations → API Access)
