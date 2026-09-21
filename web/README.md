# Jarvis Web

Vue 3, TypeScript, Pinia, Vue Router, Vite and Tailwind frontend. See the root [setup guide](../README.md) for the supported runtime and database/API setup.

## Install and run (from web/)

```sh
npm ci --ignore-scripts --no-audit
cp -n .env.example .env
npm run dev
```

Open `http://localhost:5173`. The development proxy forwards `/jarvis`, `/inbox-zero` and `/auth` to the API. Vite also inherits these proxy settings for its local preview server; they do not configure a production deployment.

## Environment

No frontend variable is required for local defaults. Every `VITE_*` value is public client/build configuration: never place API keys or other secrets here.

| Variable | Default / purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Empty: use relative API paths. Set an explicit origin only when intentionally connecting to a separate API. |
| `VITE_API_PROXY_TARGET` | `http://localhost:3000`: development proxy target. |
| `VITE_DEFAULT_SESSION_ID` | `default`: legacy development session label, not authentication. |
| `VITE_REQUEST_TIMEOUT_MS` | `60000`: client request timeout in milliseconds. |
| `VITE_BASE_PATH` | `/`: Vite asset base path. |
| `VITE_OUT_DIR` | `dist`: build output; Vite empties this directory when building, so do not point it at source/data folders. |

## Checks and build

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Typecheck and lint are read-only. `npm run lint:fix` is the separate opt-in repair command. ESLint checks Vue templates, TypeScript, Vite config and test code; existing violations remain visible until JAR-008. Tests use Node's built-in test runner with jsdom, without live API calls. The build writes into `dist/` by default.

`npm run preview` serves the build at `http://localhost:4173` and inherits the configured local API proxy. Keep the API running for interactive preview. Vite preview is for local verification, not production hosting.
