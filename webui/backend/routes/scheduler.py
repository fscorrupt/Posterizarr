"""
Scheduler Router
============================================================

Scheduler configuration and control

Endpoints:
- GET /api/scheduler/status
- GET /api/scheduler/config
- POST /api/scheduler/config
- POST /api/scheduler/schedule
- DELETE /api/scheduler/schedule/{time}
- DELETE /api/scheduler/schedules
- POST /api/scheduler/enable
- POST /api/scheduler/disable
- POST /api/scheduler/restart
- POST /api/scheduler/run-now
"""

from fastapi import APIRouter, HTTPException
import logging
import asyncio

from models.request_models import ScheduleCreate, ScheduleUpdate

router = APIRouter(tags=["scheduler"])
logger = logging.getLogger(__name__)

# Dependencies (to be injected)
state = None


def setup_dependencies(state_module):
    """Initialize scheduler router dependencies"""
    global state
    state = state_module


@router.get("/api/scheduler/status")
async def get_scheduler_status():
    """Get current scheduler status and configuration"""
    if not state or not state.SCHEDULER_AVAILABLE or not state.scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        status = state.scheduler.get_status()
        return {"success": True, **status}
    except Exception as e:
        logger.error(f"Error getting scheduler status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/scheduler/config")
async def get_scheduler_config():
    """Get scheduler configuration"""
    if not state or not state.SCHEDULER_AVAILABLE or not state.scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        config = state.scheduler.load_config()
        return {"success": True, "config": config}
    except Exception as e:
        logger.error(f"Error loading scheduler config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/scheduler/config")
async def update_scheduler_config(data: ScheduleUpdate):
    """Update scheduler configuration"""
    if not state or not state.SCHEDULER_AVAILABLE or not state.scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        updates = {}
        if data.enabled is not None:
            updates["enabled"] = data.enabled
        if data.schedules is not None:
            updates["schedules"] = data.schedules
        if data.timezone is not None:
            updates["timezone"] = data.timezone
        if data.skip_if_running is not None:
            updates["skip_if_running"] = data.skip_if_running

        config = state.scheduler.update_config(updates)

        # Restart scheduler if enabled
        if config.get("enabled", False):
            state.scheduler.restart()
        else:
            state.scheduler.stop()

        return {
            "success": True,
            "message": "Scheduler configuration updated",
            "config": config,
        }
    except Exception as e:
        logger.error(f"Error updating scheduler config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/scheduler/schedule")
async def add_schedule(data: ScheduleCreate):
    """Add a new schedule (time must be in HH:MM format, 00:00-23:59)"""
    if not state or not state.SCHEDULER_AVAILABLE or not state.scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        # Validate time format before adding
        hour, minute = state.scheduler.parse_schedule_time(data.time)
        if hour is None or minute is None:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid time format '{data.time}'. Must be HH:MM (00:00-23:59)",
            )

        success = state.scheduler.add_schedule(data.time, data.description)
        if success:
            return {"success": True, "message": f"Schedule added: {data.time}"}
        else:
            raise HTTPException(
                status_code=400, detail=f"Schedule {data.time} already exists"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding schedule: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/scheduler/schedule/{time}")
async def remove_schedule(time: str):
    """Remove a schedule by time"""
    if not state or not state.SCHEDULER_AVAILABLE or not state.scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        # Replace URL encoded colon if needed
        time = time.replace("%3A", ":")

        success = state.scheduler.remove_schedule(time)
        if success:
            # Give scheduler a moment to update jobs
            await asyncio.sleep(0.1)
            # Get updated status after removal
            status = state.scheduler.get_status()
            return {"success": True, "message": f"Schedule removed: {time}", **status}
        else:
            raise HTTPException(status_code=404, detail="Schedule not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing schedule: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/scheduler/schedules")
async def clear_all_schedules():
    """Remove all schedules"""
    if not state or not state.SCHEDULER_AVAILABLE or not state.scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        state.scheduler.clear_schedules()
        # Get updated status immediately after clearing
        status = state.scheduler.get_status()
        return {"success": True, "message": "All schedules cleared", **status}
    except Exception as e:
        logger.error(f"Error clearing schedules: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/scheduler/enable")
async def enable_scheduler():
    """Enable the scheduler"""
    if not state or not state.SCHEDULER_AVAILABLE or not state.scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        config = state.scheduler.update_config({"enabled": True})
        state.scheduler.restart()
        return {"success": True, "message": "Scheduler enabled", "config": config}
    except Exception as e:
        logger.error(f"Error enabling scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/scheduler/disable")
async def disable_scheduler():
    """Disable the scheduler"""
    if not state or not state.SCHEDULER_AVAILABLE or not state.scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        config = state.scheduler.update_config({"enabled": False})
        state.scheduler.stop()
        return {"success": True, "message": "Scheduler disabled", "config": config}
    except Exception as e:
        logger.error(f"Error disabling scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/scheduler/restart")
async def restart_scheduler():
    """Restart the scheduler with current configuration"""
    if not state or not state.SCHEDULER_AVAILABLE or not state.scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        state.scheduler.restart()
        status = state.scheduler.get_status()
        return {"success": True, "message": "Scheduler restarted", **status}
    except Exception as e:
        logger.error(f"Error restarting scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/scheduler/run-now")
async def run_scheduler_now():
    """Manually trigger a scheduled run immediately (non-blocking)"""
    if not state or not state.SCHEDULER_AVAILABLE or not state.scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        # Use asyncio.create_task to run it asynchronously
        asyncio.create_task(state.scheduler.run_script(force_run=True))

        return {"success": True, "message": "Manual run triggered successfully"}
    except RuntimeError as e:
        # Runtime errors from run_script (e.g., already running, file issues)
        logger.warning(f"Cannot trigger run: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error triggering scheduled run: {e}")
        raise HTTPException(status_code=500, detail=str(e))
