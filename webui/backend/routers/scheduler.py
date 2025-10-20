"""
Scheduler management router for Posterizarr Backend
Handles scheduler config, status, enable/disable, manual triggers
"""
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.config import BASE_DIR

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])


# ============================================================================
# REQUEST MODELS
# ============================================================================

class SchedulerConfigUpdate(BaseModel):
    """Scheduler configuration update"""
    enabled: bool
    schedules: list
    timezone: Optional[str] = None


# ============================================================================
# SCHEDULER MODULE CHECK
# ============================================================================

# Check if scheduler module is available
try:
    from scheduler import SchedulerManager
    SCHEDULER_AVAILABLE = True
    scheduler = SchedulerManager()
except ImportError:
    SCHEDULER_AVAILABLE = False
    scheduler = None
    logger.warning("scheduler module not available - scheduler features disabled")


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/status")
async def get_scheduler_status():
    """
    Get current scheduler status.
    Returns enabled state, running status, next run time, and current config.
    """
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")
    
    try:
        status = scheduler.get_status()
        return {"success": True, **status}
    except Exception as e:
        logger.error(f"Error getting scheduler status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config")
async def get_scheduler_config():
    """
    Get scheduler configuration from scheduler.json.
    Returns enabled state, schedules, and timezone.
    """
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")
    
    try:
        config = scheduler.load_config()
        return {"success": True, "config": config}
    except Exception as e:
        logger.error(f"Error getting scheduler config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config")
async def update_scheduler_config(config: SchedulerConfigUpdate):
    """
    Update scheduler configuration.
    Saves to scheduler.json and restarts scheduler if enabled.
    
    Args:
        config: New scheduler configuration
    """
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")
    
    try:
        # Convert Pydantic model to dict
        config_dict = config.dict()
        
        # Save configuration
        scheduler.save_config(config_dict)
        
        # Restart scheduler with new config
        if config.enabled:
            await scheduler.start()
        else:
            await scheduler.stop()
        
        logger.info(f"Scheduler config updated: enabled={config.enabled}")
        
        return {
            "success": True,
            "message": "Scheduler configuration updated",
            "config": config_dict,
        }
    except Exception as e:
        logger.error(f"Error updating scheduler config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/enable")
async def enable_scheduler():
    """
    Enable and start the scheduler.
    Saves enabled=true to config and starts background task.
    """
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")
    
    try:
        # Load current config
        config = scheduler.load_config()
        config["enabled"] = True
        
        # Save and start
        scheduler.save_config(config)
        await scheduler.start()
        
        logger.info("Scheduler enabled and started")
        
        return {
            "success": True,
            "message": "Scheduler enabled",
            "next_run": scheduler.get_next_run_time(),
        }
    except Exception as e:
        logger.error(f"Error enabling scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/disable")
async def disable_scheduler():
    """
    Disable and stop the scheduler.
    Saves enabled=false to config and stops background task.
    """
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")
    
    try:
        # Load current config
        config = scheduler.load_config()
        config["enabled"] = False
        
        # Save and stop
        scheduler.save_config(config)
        await scheduler.stop()
        
        logger.info("Scheduler disabled and stopped")
        
        return {
            "success": True,
            "message": "Scheduler disabled",
        }
    except Exception as e:
        logger.error(f"Error disabling scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run-now")
async def run_scheduler_now():
    """
    Trigger an immediate scheduler run.
    Does not wait for next scheduled time.
    """
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")
    
    try:
        # Check if already running
        status = scheduler.get_status()
        if status.get("is_running"):
            raise HTTPException(
                status_code=400,
                detail="Scheduler is already running. Please wait for it to finish.",
            )
        
        # Trigger immediate run
        await scheduler.run_now()
        
        logger.info("Scheduler triggered manually")
        
        return {
            "success": True,
            "message": "Scheduler started immediately",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running scheduler now: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/next-run")
async def get_next_run():
    """
    Get the next scheduled run time.
    Returns ISO 8601 timestamp or null if scheduler is disabled.
    """
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")
    
    try:
        next_run = scheduler.get_next_run_time()
        
        return {
            "success": True,
            "next_run": next_run,
            "timezone": scheduler.get_timezone(),
        }
    except Exception as e:
        logger.error(f"Error getting next run time: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs")
async def get_scheduler_logs(lines: int = 50):
    """
    Get recent scheduler execution logs.
    Returns last N log entries from scheduler history.
    
    Args:
        lines: Number of log lines to return (default: 50, max: 200)
    """
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")
    
    try:
        # Limit to reasonable range
        lines = min(max(1, lines), 200)
        
        logs = scheduler.get_execution_logs(limit=lines)
        
        return {
            "success": True,
            "logs": logs,
            "count": len(logs),
        }
    except Exception as e:
        logger.error(f"Error getting scheduler logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))
