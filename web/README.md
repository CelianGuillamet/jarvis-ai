# Jarvis Web

Frontend premium pour Jarvis (Vue 3 + Vite + TypeScript + Pinia + Tailwind).

## Démarrage

```bash
npm install
npm run dev
```

Par défaut, le frontend proxy les appels vers l'API locale `http://localhost:3000`.

## Variables d'environnement (Vite)

- `VITE_API_BASE_URL` : base URL de l'API (ex: `http://localhost:3000`). Si absent, on utilise les routes relatives (`/jarvis`, `/auth`).
- `VITE_API_PROXY_TARGET` : cible proxy en dev (default `http://localhost:3000`).
- `VITE_BASE_PATH` : `base` Vite pour servir l'app sous un sous-chemin (ex: `/dev/app/`).
- `VITE_OUT_DIR` : dossier de build (default `dist`).

## Build

```bash
npm run build
npm run preview
```

