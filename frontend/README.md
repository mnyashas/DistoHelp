# DIstoHelp — frontend (agent workspace)

The frontend agent builds here. Read **FRONTEND_BRIEF.md** first, then `../contract/openapi.yaml` and `../contract/WEBSOCKET.md`.

Quick start:

```bash
npm create vite@latest . -- --template react-ts   # or any stack you prefer
npm install
echo "VITE_API_URL=http://localhost:8000" > .env
npm run dev
```

Backend (other laptop) runs on `:8000`. Do not commit `.env`.
