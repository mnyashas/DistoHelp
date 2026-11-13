"""Virtual wearable simulator — streams per-patient readings at a configurable
rate through the same ingestion API a real device would use, plus scripted
scenario injection and on-demand event injection for the live demo."""
import asyncio
import time

from . import sim_engine, pipeline

_tasks: dict[str, asyncio.Task] = {}
_state: dict[str, dict] = {}


def status(patient_id: str | None = None) -> dict:
    if patient_id:
        return _state.get(patient_id, {"patient_id": patient_id, "running": False})
    return {pid: st for pid, st in _state.items()}


async def _run(patient_id: str, scenario: str, rate_per_minute: float, seed: int) -> None:
    interval = 60.0 / max(rate_per_minute, 0.1)  # seconds between readings
    st = _state[patient_id] = {
        "patient_id": patient_id, "running": True, "scenario": scenario,
        "rate_per_minute": rate_per_minute, "tick": 0, "started": time.time(),
    }
    try:
        for tick in sim_engine.simulate(scenario, patient_id, n_ticks=10**9, seed=seed):
            st["tick"] = tick["tick"]
            if not tick["drop"]:
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _emit, patient_id, tick)
            else:
                from . import artifacts, db
                artifacts.record_device_event(patient_id, "dropout", "Simulated device dropout (no reading emitted)")
            await asyncio.sleep(interval)
    except asyncio.CancelledError:
        pass
    finally:
        st["running"] = False


def _emit(patient_id: str, tick: dict) -> None:
    mapping = [("heart_rate", "8867-4"), ("respiratory_rate", "9279-1"),
               ("spo2", "2708-6"), ("temperature", "8310-5"),
               ("systolic_bp", "8480-6"), ("diastolic_bp", "8462-4")]
    for name, loinc in mapping:
        if tick.get(name) is not None:
            pipeline.ingest_vital(patient_id, loinc, tick[name], source="simulator")


def start(patient_id: str, scenario: str, rate_per_minute: float = 60.0, seed: int = 42) -> dict:
    if scenario not in sim_engine.SCENARIOS:
        raise ValueError(f"Unknown scenario '{scenario}'. Choose from {sim_engine.SCENARIOS}")
    stop(patient_id)
    loop = asyncio.get_running_loop()
    _tasks[patient_id] = loop.create_task(_run(patient_id, scenario, rate_per_minute, seed))
    return {"patient_id": patient_id, "scenario": scenario,
            "rate_per_minute": rate_per_minute, "running": True}


def stop(patient_id: str) -> dict:
    task = _tasks.pop(patient_id, None)
    if task:
        task.cancel()
    _state.setdefault(patient_id, {}).update({"patient_id": patient_id, "running": False})
    return {"patient_id": patient_id, "running": False}


def stop_all() -> None:
    for pid in list(_tasks):
        stop(pid)
