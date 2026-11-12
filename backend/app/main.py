"""DIstoHelp — Post-Discharge Deterioration Monitor (MineArena PS-03).

Run:  uvicorn app.main:app --reload --port 8000
"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import api, compat, config, db, seed, ws, fhir_client
from .ws import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    fhir_client.WORKER.start()
    seed.seed(post_to_hapi=True)
    ws.manager._loop = asyncio.get_event_loop()

    if config.AUTO_STREAM:
        from . import simulator
        # always-on monitoring: one stream per patient, clinically distinct scenarios
        streams = {
            "p01": "stable_recovery",   # COPD, SpO2 Scale 2 target — stable
            "p02": "slow_deterioration",  # the deterioration watch case
            "p03": "stable_recovery",   # T2DM + CKD — stable
            "p04": "probe_removal",     # post-op — frequent artifact test episodes
            "p05": "stable_recovery",   # asthma — stable
        }
        for pid, scenario in streams.items():
            try:
                simulator.start(pid, scenario, config.AUTO_STREAM_RATE, seed=abs(hash(pid)) % 10_000)
            except Exception as e:
                print(f"[autostream] {pid}: {e}")
        print(f"[autostream] always-on monitoring live for {len(streams)} patients @ {config.AUTO_STREAM_RATE} readings/min")

    async def missing_data_watchdog():
        while True:
            await asyncio.sleep(60)
            try:
                api.missing_data()
            except Exception:
                pass

    task = asyncio.create_task(missing_data_watchdog())
    yield
    task.cancel()
    from . import simulator
    simulator.stop_all()


app = FastAPI(
    title="DIstoHelp — Post-Discharge Deterioration Monitor",
    version="1.0.0",
    description=(
        "FHIR R4 vital-signs ingestion, personalized NEWS2-style scoring, "
        "sensor-artifact suppression and explainable Watch/Review/Urgent alerts. "
        + config.DISCLAIMER
    ),
    lifespan=lifespan,
)

# Hackathon: open CORS so the frontend agent can develop from any origin.
# Restrict allow_origins to the deployed frontend origin for real deployments.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(compat.router)  # frontend dialect (/auth, /patients frontend-shape, /sensors...)
app.include_router(api.router)
app.include_router(ws_router)


@app.get("/")
def root():
    return {"service": "DIstoHelp", "docs": "/docs", "health": "/api/health",
            "disclaimer": config.DISCLAIMER}
