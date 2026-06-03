# Nabor API Tester

A React + Vite dev tool for testing the Nabor NestJS API.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Structure

```
src/
├── api/          # Axios client factory
├── context/      # AppContext (JWT + baseUrl)
├── components/   # Reusable UI (Card, FormField, ResponseBox…)
├── hooks/        # useApi — typed API calls
├── pages/        # AuthPage, NeighbourhoodsPage, BanPage
└── styles/       # tokens.css, base.css, components.css
```

## Pages

- **Auth & TOTP** — Login → JWT, TOTP setup + QR, TOTP verify, SSO QR
- **Neighbourhoods** — Draw polygon on map, POST to `/admin/neighbourhoods`
- **BAN / Geo** — Address autocomplete, neighbourhood resolution, assign to profile

## Proxy

Vite proxies `/auth`, `/geo`, `/admin`, `/users` to `http://localhost:3000`.
No CORS issues in dev.

## Notes

- The Vite proxy eliminates CORS in dev. In production, build with `npm run build`
  and serve `dist/` from NestJS via `@nestjs/serve-static`.
- BAN autocomplete falls back to `api-adresse.data.gouv.fr` directly if your
  `/geo/autocomplete` route is not yet implemented.
