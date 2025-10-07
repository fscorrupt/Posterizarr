"""
Posterizarr Scheduler Module
Handles automated script execution based on configured schedules
"""

import json
import logging
import asyncio
import threading
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.executors.asyncio import AsyncIOExecutor
import subprocess
import platform

# Try to import psutil for process checking
try:
    import psutil

    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
    logging.warning(
        "psutil not available - stale running file detection will be limited"
    )

logger = logging.getLogger(__name__)


class PosterizarrScheduler:
    """Manages scheduled execution of Posterizarr script in normal mode"""

    def __init__(self, base_dir: Path, script_path: Path):
        self.base_dir = base_dir
        self.script_path = script_path
        self.config_path = base_dir / "scheduler.json"
        self.scheduler = None
        self.current_process = None
        self.is_running = False
        self._scheduler_initialized = False
        self._lock = asyncio.Lock()  # Lock for thread-safe operations

        # Initialize scheduler with timezone support
        jobstores = {"default": MemoryJobStore()}
        executors = {"default": AsyncIOExecutor()}
        job_defaults = {
            "coalesce": True,
            "max_instances": 1,
            "misfire_grace_time": 300,
        }

        self.scheduler = AsyncIOScheduler(
            jobstores=jobstores,
            executors=executors,
            job_defaults=job_defaults,
            timezone="Europe/Berlin",  # Will be updated from config
        )

    def load_config(self) -> Dict:
        """Load scheduler configuration from JSON file"""
        default_config = {
            "enabled": False,
            "schedules": [],
            "timezone": "Europe/Berlin",
            "skip_if_running": True,
            "last_run": None,
            "next_run": None,
        }

        if not self.config_path.exists():
            self.save_config(default_config)
            return default_config

        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
            return {**default_config, **config}  # Merge with defaults
        except Exception as e:
            logger.error(f"Error loading scheduler config: {e}")
            return default_config

    def save_config(self, config: Dict) -> bool:
        """Save scheduler configuration to JSON file"""
        try:
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            logger.error(f"Error saving scheduler config: {e}")
            return False

    def update_config(self, updates: Dict) -> Dict:
        """Update specific config values"""
        config = self.load_config()
        config.update(updates)
        self.save_config(config)

        # Update scheduler timezone if changed
        if "timezone" in updates and self.scheduler:
            self.scheduler.configure(timezone=updates["timezone"])
            logger.info(f"Scheduler timezone updated to {updates['timezone']}")
            # Recalculate next_run with new timezone
            if config.get("schedules"):
                self.update_next_run_from_schedules()

        return config

    def _is_posterizarr_actually_running(self) -> bool:
        """Check if Posterizarr is actually running by checking for PowerShell processes"""
        if not PSUTIL_AVAILABLE:
            logger.warning(
                "psutil not available - cannot verify if process is running, assuming file is valid"
            )
            return True

        import psutil

        try:
            for proc in psutil.process_iter(["pid", "name", "cmdline"]):
                try:
                    cmdline = proc.info.get("cmdline")
                    if cmdline:
                        cmdline_str = " ".join(cmdline).lower()
                        # Check if it's a PowerShell process running Posterizarr.ps1
                        if (
                            "pwsh" in cmdline_str or "powershell" in cmdline_str
                        ) and "posterizarr.ps1" in cmdline_str:
                            logger.info(
                                f"Found running Posterizarr process: PID {proc.info['pid']}"
                            )
                            return True
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            return False
        except Exception as e:
            logger.error(f"Error checking for running processes: {e}")
            # If we can't check, assume it might be running to be safe
            return True

    async def run_script(self):
        """Execute Posterizarr script in normal mode (non-blocking)"""
        config = self.load_config()

        # Check if script should be skipped when already running
        if config.get("skip_if_running", True) and self.is_running:
            logger.warning("Script is already running, skipping scheduled execution")
            return

        # Check if another process is running
        running_file = self.base_dir / "temp" / "Posterizarr.Running"
        if running_file.exists():
            logger.warning(
                "Posterizarr.Running file exists, checking if process is actually running..."
            )

            # Check if Posterizarr is actually running
            if self._is_posterizarr_actually_running():
                logger.warning(
                    "Posterizarr process is running, skipping scheduled execution"
                )
                return
            else:
                # File exists but no process is running - force delete
                logger.warning(
                    "Posterizarr.Running file exists but no process found - force deleting stale file"
                )
                try:
                    running_file.unlink()
                    logger.info("Successfully deleted stale Posterizarr.Running file")
                except Exception as e:
                    logger.error(f"Failed to delete stale running file: {e}")
                    return

        try:
            self.is_running = True

            # Update last run time
            config["last_run"] = datetime.now().isoformat()
            self.save_config(config)

            # Determine PowerShell command
            if platform.system() == "Windows":
                ps_command = "pwsh"
                try:
                    subprocess.run([ps_command, "-v"], capture_output=True, check=True)
                except (subprocess.CalledProcessError, FileNotFoundError):
                    ps_command = "powershell"
                    logger.info("pwsh not found, using powershell instead")
            else:
                ps_command = "pwsh"

            command = [ps_command, "-File", str(self.script_path)]

            logger.info(f"Executing scheduled run: {' '.join(command)}")

            # FIX: Use subprocess.Popen in a thread instead of asyncio.create_subprocess_exec
            # This fixes the NotImplementedError on Windows with asyncio
            def run_in_thread():
                """Run subprocess in a separate thread to avoid blocking"""
                try:
                    process = subprocess.Popen(
                        command,
                        cwd=str(self.base_dir),
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                    )
                    self.current_process = process

                    # Wait for completion
                    stdout, stderr = process.communicate()

                    if process.returncode == 0:
                        logger.info("Scheduled script execution completed successfully")
                    else:
                        logger.error(
                            f"Scheduled script execution failed with code {process.returncode}"
                        )
                        if stderr:
                            logger.error(f"Error output: {stderr[:500]}")

                    return process.returncode
                except Exception as e:
                    logger.error(f"Error in subprocess thread: {e}", exc_info=True)
                    return -1

            # Run subprocess in thread pool to avoid blocking the event loop
            loop = asyncio.get_event_loop()
            returncode = await loop.run_in_executor(None, run_in_thread)

            logger.info(f"Scheduled run finished with return code: {returncode}")

        except Exception as e:
            # Better error logging with full stack trace
            logger.error(f"Error during scheduled script execution: {e}", exc_info=True)
        finally:
            self.is_running = False
            self.current_process = None
            # Update next_run after execution completes
            self.update_next_run()

    def parse_schedule_time(self, time_str: str) -> tuple:
        """Parse time string (HH:MM) into hour and minute"""
        try:
            hour, minute = time_str.split(":")
            return int(hour), int(minute)
        except Exception as e:
            logger.error(f"Error parsing time '{time_str}': {e}")
            return None, None

    def apply_schedules(self):
        """Apply all configured schedules to the scheduler"""
        config = self.load_config()

        # Remove all existing jobs
        self.scheduler.remove_all_jobs()

        if not config.get("enabled", False):
            logger.info("Scheduler is disabled, not applying schedules")
            return

        schedules = config.get("schedules", [])
        if not schedules:
            logger.warning("No schedules configured")
            # Reset next_run when no schedules exist
            config["next_run"] = None
            self.save_config(config)
            return

        # Get timezone from config
        timezone = config.get("timezone", "Europe/Berlin")

        # Add jobs for each schedule
        for idx, schedule in enumerate(schedules):
            time_str = schedule.get("time", "")
            hour, minute = self.parse_schedule_time(time_str)

            if hour is None or minute is None:
                logger.error(f"Invalid schedule time: {time_str}")
                continue

            job_id = f"posterizarr_normal_{idx}"

            # Create cron trigger for daily execution
            trigger = CronTrigger(
                hour=hour,
                minute=minute,
                timezone=timezone,
            )

            self.scheduler.add_job(
                self.run_script,
                trigger=trigger,
                id=job_id,
                name=f"Posterizarr Normal Mode @ {time_str}",
                replace_existing=True,
            )

            logger.info(f"Added schedule: {time_str} (Job ID: {job_id})")

        # FIX 2: Update next_run immediately instead of with delay
        self.update_next_run()

    def update_next_run(self):
        """Update next_run timestamp in config immediately"""
        try:
            jobs = self.scheduler.get_jobs()
            if jobs:
                next_runs = [
                    job.next_run_time
                    for job in jobs
                    if hasattr(job, "next_run_time") and job.next_run_time
                ]
                if next_runs:
                    next_run = min(next_runs)
                    config = self.load_config()
                    config["next_run"] = next_run.isoformat()
                    self.save_config(config)
                    logger.info(f"Next scheduled run: {next_run}")
                else:
                    logger.warning("No next_run_time found for jobs")
            else:
                logger.debug("No active jobs to update next_run")
        except Exception as e:
            logger.error(f"Error updating next_run: {e}")

    def start(self):
        """Start the scheduler"""
        try:
            config = self.load_config()

            if not config.get("enabled", False):
                logger.info("Scheduler is disabled in config, not starting")
                return

            if not self.scheduler.running:
                # Update timezone before starting
                timezone = config.get("timezone", "Europe/Berlin")
                self.scheduler.configure(timezone=timezone)

                # Calculate next_run if schedules exist but next_run is not set
                if config.get("schedules") and not config.get("next_run"):
                    logger.info("Schedules exist but next_run not set, calculating...")
                    self.update_next_run_from_schedules()

                # Apply schedules
                self.apply_schedules()

                # Start scheduler
                self.scheduler.start()
                logger.info(f"Scheduler started with timezone {timezone}")

                # Update next_run immediately
                self.update_next_run()
                self._scheduler_initialized = True
            else:
                logger.info("Scheduler is already running")
        except Exception as e:
            logger.error(f"Error starting scheduler: {e}", exc_info=True)

    def stop(self):
        """Stop the scheduler"""
        try:
            if self.scheduler.running:
                self.scheduler.shutdown(wait=False)
                logger.info("Scheduler stopped")
                self._scheduler_initialized = False

                # Reset next_run when scheduler is stopped
                config = self.load_config()
                config["next_run"] = None
                self.save_config(config)
        except Exception as e:
            logger.error(f"Error stopping scheduler: {e}", exc_info=True)

    def restart(self):
        """Restart the scheduler with new configuration"""
        logger.info("Restarting scheduler...")
        try:
            self.stop()
            self.start()
        except Exception as e:
            logger.error(f"Error restarting scheduler: {e}", exc_info=True)

    def get_status(self) -> Dict:
        """Get current scheduler status"""
        config = self.load_config()
        jobs = self.scheduler.get_jobs() if self.scheduler.running else []

        job_info = []
        for job in jobs:
            next_run = None
            if hasattr(job, "next_run_time") and job.next_run_time:
                next_run = job.next_run_time.isoformat()

            job_info.append(
                {
                    "id": job.id,
                    "name": job.name,
                    "next_run": next_run,
                }
            )

        return {
            "enabled": config.get("enabled", False),
            "running": self.scheduler.running,
            "is_executing": self.is_running,
            "schedules": config.get("schedules", []),
            "timezone": config.get("timezone", "Europe/Berlin"),
            "last_run": config.get("last_run"),
            "next_run": config.get("next_run"),
            "active_jobs": job_info,
        }

    def calculate_next_run_time(self, time_str: str) -> Optional[str]:
        """Calculate the next run time for a given schedule time (HH:MM)"""
        from datetime import datetime, timedelta
        import pytz

        hour, minute = self.parse_schedule_time(time_str)
        if hour is None or minute is None:
            return None

        config = self.load_config()
        timezone_str = config.get("timezone", "Europe/Berlin")

        try:
            tz = pytz.timezone(timezone_str)
            now = datetime.now(tz)

            # Create today's scheduled time
            scheduled_time = now.replace(
                hour=hour, minute=minute, second=0, microsecond=0
            )

            # If scheduled time has passed today, use tomorrow
            if scheduled_time <= now:
                scheduled_time += timedelta(days=1)

            return scheduled_time.isoformat()
        except Exception as e:
            logger.error(f"Error calculating next run time: {e}")
            return None

    def update_next_run_from_schedules(self):
        """Update next_run in config based on all schedules (without requiring scheduler to be running)"""
        config = self.load_config()
        schedules = config.get("schedules", [])

        if not schedules:
            config["next_run"] = None
            self.save_config(config)
            logger.debug("No schedules, next_run set to None")
            return

        # Calculate next run for all schedules
        next_runs = []
        for schedule in schedules:
            time_str = schedule.get("time", "")
            next_run = self.calculate_next_run_time(time_str)
            if next_run:
                next_runs.append(next_run)

        if next_runs:
            # Get the earliest next run
            next_run = min(next_runs)
            config["next_run"] = next_run
            self.save_config(config)
            logger.info(f"Next run updated to: {next_run}")
        else:
            config["next_run"] = None
            self.save_config(config)
            logger.warning("No valid next runs calculated")

    def add_schedule(self, time_str: str, description: str = "") -> bool:
        """Add a new schedule"""
        hour, minute = self.parse_schedule_time(time_str)
        if hour is None or minute is None:
            return False

        config = self.load_config()
        schedules = config.get("schedules", [])

        # Check for duplicates
        if any(s.get("time") == time_str for s in schedules):
            logger.warning(f"Schedule {time_str} already exists")
            return False

        schedules.append({"time": time_str, "description": description})
        config["schedules"] = schedules
        self.save_config(config)

        logger.info(f"Added new schedule: {time_str}")

        # FIX 3: If scheduler is running and enabled, reapply schedules immediately
        if config.get("enabled", False) and self.scheduler.running:
            logger.info("Scheduler is running, reapplying schedules...")
            self.apply_schedules()
        else:
            # Even if not running, update next_run for UI display
            self.update_next_run_from_schedules()

        return True

    def remove_schedule(self, time_str: str) -> bool:
        """Remove a schedule"""
        config = self.load_config()
        schedules = config.get("schedules", [])

        new_schedules = [s for s in schedules if s.get("time") != time_str]

        if len(new_schedules) == len(schedules):
            return False  # Schedule not found

        config["schedules"] = new_schedules

        logger.info(f"Removed schedule: {time_str}")

        # If no schedules left, reset next_run
        if len(new_schedules) == 0:
            config["next_run"] = None
            logger.info("Last schedule removed, resetting next_run to None")
            self.save_config(config)
        else:
            # Save config first
            self.save_config(config)

            # FIX 4: If scheduler is running and enabled, reapply schedules immediately
            if config.get("enabled", False) and self.scheduler.running:
                logger.info("Scheduler is running, reapplying schedules...")
                self.apply_schedules()
            else:
                # Even if not running, recalculate next_run for UI display
                self.update_next_run_from_schedules()

        return True

    def clear_schedules(self) -> bool:
        """Remove all schedules"""
        config = self.load_config()
        config["schedules"] = []
        config["next_run"] = None  # Reset next_run when no schedules exist
        self.save_config(config)

        logger.info("All schedules cleared")

        # FIX 5: If scheduler is running, reapply empty schedules
        if config.get("enabled", False) and self.scheduler.running:
            logger.info("Scheduler is running, reapplying schedules (now empty)...")
            self.apply_schedules()

        return True
