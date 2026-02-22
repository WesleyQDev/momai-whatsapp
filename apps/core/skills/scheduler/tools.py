from langchain_core.tools import tool
from pydantic import BaseModel, Field
from typing import Literal
from datetime import datetime


class CreateReminderInput(BaseModel):
    title: str = Field(description="Short title for the reminder.")
    content: str | None = Field(default=None, description="Optional extra detail.")
    scheduled_time: str = Field(
        description="Date and time for the trigger in ISO format (YYYY-MM-DD HH:MM:SS). Calculate exactly using the current system time provided. NEVER schedule in the past. If the requested time has passed today (e.g. 9h when it's 16h), you MUST schedule for tomorrow. Voice audio might say 'a manhã', interpret as 'Amanhã' (tomorrow)."
    )
    repeat_interval: str | None = Field(
        default=None,
        description="Interval unit for repetition (e.g., 'minutes', 'hours', 'days', 'weeks', 'months'). Null if it does not repeat.",
    )
    repeat_value: int | None = Field(
        default=None,
        description="Value for interval (e.g., 25 for 'every 25 minutes').",
    )


@tool(args_schema=CreateReminderInput)
def create_reminder(
    title: str,
    scheduled_time: str,
    content: str | None = None,
    repeat_interval: str | None = None,
    repeat_value: int | None = None,
) -> str:
    """
    Schedules a new reminder or alarm. Ensure scheduled_time is in YYYY-MM-DD HH:MM:SS format using the current system time provided to you.
    """
    import app_state

    try:
        # LLMs often add T, Z, or GMT, clean it up before parsing
        clean_time = scheduled_time.replace("T", " ").replace("Z", "").replace("GMT", "").strip()
        dt = datetime.fromisoformat(clean_time)
        
        if not app_state.reminder_manager:
            return "Error: Reminder manager not ready."
        app_state.reminder_manager.add_reminder(
            title, content, dt, repeat_interval, repeat_value
        )
        return f"OK: Reminder '{title}' scheduled for {dt.strftime('%A, %Y-%m-%d %H:%M:%S')}."
    except ValueError as e:
        return f"Error scheduling: Invalid time format '{scheduled_time}'. Use YYYY-MM-DD HH:MM:SS."
    except Exception as e:
        return f"Error scheduling: {str(e)}"


@tool
def list_reminders() -> str:
    """Lists all active reminders and their schedules."""
    import app_state

    if not app_state.reminder_manager:
        return "Reminder system not initialized."
    reminders = app_state.reminder_manager.list_reminders()
    if not reminders:
        return "You have no active reminders."

    res = "### Current Reminders:\n\n"
    for r in reminders:
        status = "Active" if r.is_active else "Off"
        res += f"- **ID {r.id}:** {r.title} (Scheduled: {r.scheduled_time}) - Status: {status}\n"
    return res


@tool
def delete_reminder(reminder_id: int) -> str:
    """Deletes a reminder by its ID."""
    import app_state

    if not app_state.reminder_manager:
        return "Error: Reminder manager not ready."
    app_state.reminder_manager.delete_reminder(reminder_id)
    return f"Reminder {reminder_id} deleted."
