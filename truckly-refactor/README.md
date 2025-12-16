## Truckly Refactor (Next.js)

This repository now hosts both the Truckly web dashboard and the backend APIs (auth, vehicles catalog, WebSocket telemetry) inside a single Next.js application. The legacy `truckly-backend` Express server has been retired.

### Prerequisites

- Node.js 18+
- MongoDB credentials (same ones previously used by `truckly-backend`)

### Environment

Create or update `.env.local` with the secrets from the former backend:

```env
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
ACCESS_EXPIRES=24h
REFRESH_EXPIRES=7d
MONGO_URI=... # or specify MONGO_HOSTS + MONGO_ROOT_USER + MONGO_ROOT_PASSWORD
USER_SECRET=... # optional AES key; defaults to JWT secret
```

### Development

```bash
npm install
npm run dev
```

- `app/api/auth/login` mirrors the old `/auth/login` controller and sets `accessToken` / `refreshToken` cookies.
- `app/api/vehicles` exposes the decrypted vehicles list, automatically scoping to the authenticated user.
- `pages/api/stream` hosts the WebSocket endpoint reused by the map for live telemetry.

The UI lives inside `app/` (e.g. `app/login`, `app/dashboard`) and consumes those internal APIs, so no additional servers are required.

### Production build

```bash
npm run build
npm start
```

Ensure the same `.env` values are present in the production environment before booting the Next.js server.
