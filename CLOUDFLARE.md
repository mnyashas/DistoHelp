# Deploying DIstoHelp via Cloudflare

Honest constraint first: this system is **Python (FastAPI) + HAPI FHIR + SQLite** — a classic backend, not a serverless app. It cannot run *inside* Cloudflare Workers/Pages. What Cloudflare gives you that works perfectly for the demo:

## Route A — Cloudflare Tunnel (recommended, 2 minutes, FREE)

Your laptop stays the server (backend + HAPI + always-on demo streams). Cloudflare publishes it over HTTPS with a public URL — judges, phones, anyone.

```powershell
# 1. Backend + frontend already running:
#    Terminal 1: cd backend; uvicorn app.main:app --port 8000
#    Terminal 2: cd frontend; npm run dev -- --host        # http://10.57.20.137:5173

# 2. Start a quick tunnel (no account, no signup, no config):
# NOTE: if your network blocks QUIC/UDP 443, force HTTP/2 instead:
.\scripts\cloudflared\cloudflared.exe tunnel --url http://localhost:5173 --no-autoupdate --protocol http2

# Output ends with something like:
#   https://something.trycloudflare.com
# That is your public URL — share it with judges. Phone-as-wearable works through it too.

# A working example from this machine:
#   https://invalid-explains-ends-possibility.trycloudflare.com   <- changes on restart
```

- The Vite dev server proxies `/api` and `/ws` to `localhost:8000`, so the public URL serves **everything** — dashboard, watch kiosk, patient portal (`/me`).
- QR codes in Review pane: point your phone at the `*.trycloudflare.com` URL.
- The URL changes on every restart. Keep the tunnel running during the demo.
- If your laptop is on the same Wi-Fi, phones also reach it directly at `http://<lan-ip>:5173`.

**Named tunnel (stable URL, optional):** needs a free Cloudflare account.
```powershell
.\scripts\cloudflared\cloudflared.exe tunnel login    # browser auth, once
.\scripts\cloudflared\cloudflared.exe tunnel create distohelp
.\scripts\cloudflared\cloudflared.exe tunnel route dns distohelp distohelp.yourdomain.com
.\scripts\cloudflared\cloudflared.exe tunnel run distohelp
```

## Route B — Cloudflare Pages (static, needs separate API hosting)

Serve only the built frontend on Pages; the backend must live on a public URL you control (VPS, Render, Fly.io). For the hackathon there is no reason to do this — Route A hosts everything.

```powershell
cd frontend
$env:VITE_API_URL = "https://your-backend-host.example.com"
$env:VITE_WS_URL  = "https://your-backend-host.example.com"
npm run build
npx wrangler pages deploy dist --project-name distohelp
```

Notes:
- `npm run build` uses `VITE_API_URL`/`VITE_WS_URL` to reach the backend — see `src/services/api.js` and `Live.jsx`/`Watch.jsx`. Default is same-origin `/api`, which is what Route A needs — do **not** set these for Route A.
- WebSocket (`/ws/live`) is the hard part for pure-static hosting; Route A handles it transparently.

## Route C — Render.com (permanent, free, no domain needed) — deployed from `render.yaml`

Fully self-hosted public URLs on Render's free tier. No tunnel, no domain, no signup beyond a Render account (GitHub sign-in).

```powershell
# 1. Open render.com (Sign up with GitHub — free, no card)
# 2. New -> Blueprint -> select repo mnyashas/DIstoHelp -> Apply
# 3. Render reads render.yaml and creates:
#    distohelp-ps03-api  (FastAPI, HAPI public sandbox)  https://distohelp-ps03-api.onrender.com
#    distohelp-ps03-ui   (static frontend, CDN, HTTPS)   https://distohelp-ps03-ui.onrender.com
# 4. ~5 min later both are live. Share the ui URL with judges.
```

Caveats (honest):
- Free instances **sleep after 15 min idle** — first request in ~60 s. Fine for a demo; for 24/7 use pay $7/mo.
- SQLite re-seeds on every boot; mentor data + monitoring history reset on redeploy/restart.
- HAPI uses public hapi.fhir.org/baseR4 — good for the demo, not for real patient data.
- For a true production setup you'd need a domain (Cloudflare named tunnel or Render custom domain) and a managed FHIR store.

## What NOT to attempt
Running the backend on Cloudflare Workers — it's a FastAPI app with SQLite, HAPI FHIR and WebSockets; porting to Workers would be a full rewrite, not a deploy.
