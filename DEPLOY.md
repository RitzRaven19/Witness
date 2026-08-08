# Deploying the Witness ingestion server

`apps/server` (architecture.md §7) is the only backend component: it accepts
resumable tus uploads of encrypted evidence blobs and LoRa `HashReceipt`
ingestion, and correlates the two. It never sees plaintext or decryption
keys. Anyone can self-host it — an NGO, a legal team, an individual
journalist's org.

Two ways to run it: a **standalone container** for quick testing, or
**docker-compose with automatic TLS** for anything real.

---

## Quick test (no TLS, local network only)

```bash
docker build -f apps/server/Dockerfile -t witness-server .
docker run -d --name witness-server \
  -p 3001:3001 \
  -e INGEST_TOKEN=$(openssl rand -hex 32) \
  -v witness-data:/app/data \
  witness-server

curl http://localhost:3001/health
```

This is plain HTTP — fine on a trusted LAN for testing, **not for anything
crossing a public network** (see Security below).

---

## Production: docker-compose + automatic TLS

Requires a domain name pointed at the host (A/AAAA record) and ports 80/443
reachable from the internet — [Caddy](https://caddyserver.com/) uses them for
the ACME HTTP challenge and then serves everything over HTTPS.

```bash
cp .env.deploy.example .env.deploy
# edit .env.deploy: set DOMAIN and INGEST_TOKEN (openssl rand -hex 32)

docker compose --env-file .env.deploy up -d --build
```

That's it — Caddy requests and renews the certificate automatically, and
reverse-proxies `https://$DOMAIN/*` to the server container, which is not
exposed directly (`docker-compose.yml` only publishes 80/443 on the Caddy
container).

Check it:

```bash
curl https://your-domain/health
```

### Updating

```bash
git pull
docker compose --env-file .env.deploy up -d --build
```

Evidence manifests and receipts live in the `server-data` named volume and
survive rebuilds. **Back it up** — it's the only server-side state:

```bash
docker run --rm -v witness_server-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/witness-data-$(date +%F).tar.gz -C /data .
```

---

## Configure the app to use your server

In the Witness PWA:

- **Evidence uploads**: `apps/pwa/.env` → `VITE_TUS_ENDPOINT=https://your-domain/files`, and `VITE_VAULT_KEY=<the same INGEST_TOKEN>` (sent as the upload's bearer token). Rebuild the PWA after editing `.env`.
- **LoRa mesh receipts**: in-app, Settings → Mesh Provisioning → set **Ingestion Endpoint URL** to `https://your-domain/ingest` and **Ingestion Token** to the same `INGEST_TOKEN`. No rebuild needed — this is runtime config, stored per-device.

---

## Environment variables

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `PORT` | server | `3001` | Listen port |
| `DATA_DIR` | server | `./data` (Docker: `/app/data`, volume-backed) | Manifests, receipts, tus upload storage |
| `INGEST_TOKEN` | server | unset (auth disabled) | Bearer token required for `/files/*` and `POST /ingest`. **Set this before exposing the server publicly** — without it, anyone who finds the URL can upload garbage or plant fake receipts. `/health` and `GET /receipts/:hash` are always open (they leak nothing sensitive). |
| `DOMAIN` | compose/Caddy | — | Public domain for the automatic TLS certificate |

---

## Security notes

- **Always run behind TLS in production.** A bearer token sent over plain
  HTTP is trivially sniffable; the compose setup handles this via Caddy.
  The standalone `docker run` path is HTTP-only and is for local testing.
- **Set `INGEST_TOKEN`.** The server has no other access control. Anyone with
  the URL and no token can fill your disk with junk uploads or plant fake
  receipts (which are silently rejected by the app's signature verification
  downstream, but still cost you storage and noise).
- **Rotating the token** means restarting the container with a new
  `INGEST_TOKEN` and reconfiguring every client (`.env` for uploads, Settings
  for mesh ingestion) — there's no multi-token or per-device revocation yet.
- **The server never receives plaintext or decryption keys.** What it proves
  is which ciphertext arrived, when, and that a signed receipt exists for the
  same media hash — see `apps/server/src/server.ts` for the exact guarantee.
- This is a reference deployment for getting a working NGO instance running
  quickly, not a hardened multi-tenant SaaS. For real field use, put it
  behind your organisation's existing access controls (VPN, IP allowlist, or
  a proper auth proxy) in addition to `INGEST_TOKEN`.
