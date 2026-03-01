from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from datetime import datetime, timedelta
from database.models import SessionLocal, Reminder, DB_PATH
import asyncio
import logging

logger = logging.getLogger("uvicorn.error")

class ReminderManager:
    def __init__(self, broadcast_callback=None, tts_callback=None):
        self.scheduler = AsyncIOScheduler()
        self.broadcast_callback = broadcast_callback
        self.tts_callback = tts_callback
        self.running = False

    def start(self):
        """Starts the scheduler and loads existing reminders."""
        if not self.running:
            # Recreate scheduler instance to avoid "threads can only be started once" 
            # error after a previous shutdown()
            self.scheduler = AsyncIOScheduler()
            self.scheduler.start()
            self.running = True
            logger.info("[Reminders] Scheduler started.")
            self._load_reminders_to_scheduler()

    def stop(self):
        """Stops the scheduler."""
        if self.running:
            try:
                self.scheduler.shutdown()
            except Exception as e:
                logger.error(f"[Reminders] Error shutting down scheduler: {e}")
            self.running = False

    def _load_reminders_to_scheduler(self):
        """Loads active reminders from the database into the scheduler at startup."""
        db = SessionLocal()
        active_reminders = db.query(Reminder).filter(Reminder.is_active == True).all()
        for r in active_reminders:
            self._schedule_job(r)
        db.close()

    def _schedule_job(self, reminder: Reminder):
        """Schedules a single reminder job."""
        job_id = f"reminder_{reminder.id}"
        
        # Remove if already exists (for updates)
        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)

        if reminder.repeat_interval:
            # Recurring schedule
            trigger_args = {reminder.repeat_interval: reminder.repeat_value}
            self.scheduler.add_job(
                self.trigger_reminder,
                'interval',
                **trigger_args,
                start_date=reminder.scheduled_time,
                id=job_id,
                args=[reminder.id]
            )
        else:
            # Single schedule
            # Use a small grace period (10s) to allow scheduling "now" reminders
            now = datetime.now()
            if reminder.scheduled_time > now or (now - reminder.scheduled_time).total_seconds() < 10:
                self.scheduler.add_job(
                    self.trigger_reminder,
                    'date',
                    run_date=reminder.scheduled_time if reminder.scheduled_time > now else now,
                    id=job_id,
                    args=[reminder.id]
                )
                logger.info(f"[Reminders] Scheduled single job for {reminder.scheduled_time}")
            else:
                logger.warning(f"[Reminders] Reminder {reminder.id} is in the past ({reminder.scheduled_time}), not scheduling.")

    async def trigger_reminder(self, reminder_id: int):
        """
        Executed when the reminder time is reached.

        Args:
            reminder_id (int): The ID of the reminder to trigger.
        """
        db = SessionLocal()
        reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
        
        if reminder:
            logger.info(f"[Reminders] Triggering reminder: {reminder.title}")
            
            # 1. Notify via WebSocket (Front-end)
            if self.broadcast_callback:
                asyncio.create_task(self.broadcast_callback({
                    "type": "reminder_trigger",
                    "data": {
                        "id": reminder.id,
                        "title": reminder.title,
                        "content": reminder.content,
                        "note_id": reminder.note_id
                    }
                }))

            # 2. Notify via TTS
            # For 'reminder' type, we speak the title/content.
            # For 'cron' type, we skip this and let the agent speak its result.
            if reminder.voice_response and reminder.action_type == "reminder":
                import app_state
                if app_state.tts:
                    # User wants concise TTS without prefixes like 'Sir, reminder:'
                    msg = f"{reminder.title}. {reminder.content if reminder.content else ''}"
                    app_state.tts.speak_sentence(msg)

            # 3. Handle Custom Command (Cron-like)
            if reminder.action_type == "cron":
                import app_state
                command = reminder.content if reminder.content and reminder.content.strip() else reminder.title
                
                if not command or not command.strip():
                    logger.warning(f"[Reminders] Skipping cron job {reminder.id}: No command content found.")
                else:
                    logger.info(f"[Reminders] Executing agent command: {command}")
                    if app_state.main_loop:
                        try:
                            loop = asyncio.get_running_loop()
                            if loop == app_state.main_loop:
                                asyncio.create_task(app_state.process_voice_command(command, speak_response=reminder.voice_response))
                            else:
                                asyncio.run_coroutine_threadsafe(
                                    app_state.process_voice_command(command, speak_response=reminder.voice_response),
                                    app_state.main_loop
                                )
                        except RuntimeError:
                             asyncio.run_coroutine_threadsafe(
                                app_state.process_voice_command(command, speak_response=reminder.voice_response),
                                app_state.main_loop
                            )
                    else:
                        logger.error(f"[Reminders] Cannot execute command: main_loop not initialized in app_state.")

            # 4. If not recurring, deactivate
            if not reminder.repeat_interval:
                reminder.is_active = False
            
            db.commit()
            logger.info(f"[Reminders] Job finished for id {reminder_id}")
        
        db.close()

    def add_reminder(self, title, content, scheduled_time, repeat_interval=None, repeat_value=None, note_id=None, action_type="reminder", voice_response=True):
        """
        Adds a new reminder to the database and schedules it.

        Args:
            title (str): Reminder title.
            content (str): Reminder content.
            scheduled_time (datetime): When to trigger.
            repeat_interval (str, optional): 'minutes', 'hours', etc.
            repeat_value (int, optional): Frequency of repeat.

        Returns:
            Reminder: The created reminder object.
        """
        db = SessionLocal()
        try:
            logger.info(f"[Reminders] Saving to DB: {title} for {scheduled_time}")
            reminder = Reminder(
                title=title,
                content=content,
                scheduled_time=scheduled_time,
                repeat_interval=repeat_interval,
                repeat_value=repeat_value,
                note_id=note_id,
                action_type=action_type,
                voice_response=voice_response,
                is_active=True
            )
            db.add(reminder)
            db.commit()
            db.refresh(reminder)
            logger.info(f"[Reminders] Saved with ID: {reminder.id}")
            
            self._schedule_job(reminder)
            logger.info(f"[Reminders] Scheduled successfully.")
            self._notify_updates()
            return reminder
        except Exception as e:
            logger.error(f"[Reminders] ERROR adding reminder: {e}")
            db.rollback()
            raise e
        finally:
            db.close()

    def list_reminders(self):
        db = SessionLocal()
        reminders = db.query(Reminder).all()
        db.close()
        return reminders

    def delete_reminder(self, reminder_id):
        db = SessionLocal()
        reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
        if reminder:
            db.delete(reminder)
            db.commit()
            job_id = f"reminder_{reminder_id}"
            if self.scheduler.get_job(job_id):
                self.scheduler.remove_job(job_id)
            self._notify_updates()
        db.close()

    def update_reminder(self, reminder_id, **kwargs):
        """
        Updates an existing reminder.
        """
        db = SessionLocal()
        try:
            reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
            if not reminder:
                return None
            
            for key, value in kwargs.items():
                if hasattr(reminder, key) and value is not None:
                    setattr(reminder, key, value)
            
            # Ensure it's active if updated
            reminder.is_active = True
            
            db.commit()
            db.refresh(reminder)
            
            self._schedule_job(reminder)
            self._notify_updates()
            return reminder
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

    def _notify_updates(self):
        """Fires a WebSocket event indicating that reminders changed."""
        if not self.broadcast_callback:
            return
        
        try:
            import app_state
            if app_state.main_loop:
                asyncio.run_coroutine_threadsafe(
                    self.broadcast_callback({
                        "type": "reminders_updated",
                        "data": {}
                    }),
                    app_state.main_loop
                )
        except Exception as e:
            logger.warning(f"[Reminders] Failed to notify updates: {e}")
