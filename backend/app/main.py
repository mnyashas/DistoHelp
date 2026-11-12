"""DIstoHelp — Post-Discharge Deterioration Monitor (MineArena PS-03).

Run:  uvicorn app.main:app --reload --port 8000
"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import api, config, db, seed, ws
from .ws import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    seed.seed(post_to_hapi=True)
    ws.manager._loop = asyncio.get_event_loop()

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

app.include_router(api.router)
app.include_router(ws_router)


@app.get("/")
def root():
    return {"service": "DIstoHelp", "docs": "/docs", "health": "/api/health",
            "disclaimer": config.DISCLAIMER}
