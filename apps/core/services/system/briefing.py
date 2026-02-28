import asyncio
import logging
from datetime import datetime, date
from sqlalchemy.orm import Session
from database.models import SessionLocal, Settings, Reminder
import app_state

logger = logging.getLogger("momai.briefing")

async def check_and_run_daily_briefing(force: bool = False):
    """
    Checks if a daily briefing is due and runs it if necessary.
    """
    db = SessionLocal()
    try:
        settings = db.query(Settings).first()
        if not settings or not settings.daily_briefing_enabled:
            return

        if not settings.tts_enabled:
            return

        today_str = date.today().isoformat() # YYYY-MM-DD
        
        if not force and settings.last_briefing_date == today_str:
            # Already briefing today
            return

        logger.info(f"[Briefing] Starting daily briefing for {today_str} (force={force})")
        
        # 1. Generate the briefing text
        briefing_text = await generate_briefing_text(db, settings.user_name)
        
        # 2. Update the last briefing date
        settings.last_briefing_date = today_str
        db.commit()

        # 3. Schedule the speech (wait for system ready)
        asyncio.create_task(run_briefing_speech(briefing_text))
        
    except Exception as e:
        logger.error(f"[Briefing] Error during briefing check: {e}")
    finally:
        db.close()

async def generate_briefing_text(db: Session, user_name: str) -> str:
    """Generates the speech text for the briefing."""
    now = datetime.now()
    
    days_map = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]
    pt_months = {
        "1": "janeiro", "2": "fevereiro", "3": "março", "4": "abril", "5": "maio", "6": "junho",
        "7": "julho", "8": "agosto", "9": "setembro", "10": "outubro", "11": "novembro", "12": "dezembro"
    }
    
    day_sent = f"Bom dia, {user_name}. Hoje é {days_map[now.weekday()]}, dia {now.day} de {pt_months.get(str(now.month))}."
    
    # Reminders for today
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    
    reminders_today = db.query(Reminder).filter(
        Reminder.is_active == True,
        Reminder.scheduled_time >= today_start,
        Reminder.scheduled_time <= today_end
    ).order_by(Reminder.scheduled_time.asc()).all()
    
    agenda_sent = ""
    if reminders_today:
        count = len(reminders_today)
        if count == 1:
            r = reminders_today[0]
            time_str = r.scheduled_time.strftime("%H:%M")
            agenda_sent = f" Você tem um compromisso hoje: {r.title}, às {time_str}."
        else:
            agenda_sent = f" Você tem {count} compromissos agendados para hoje."
            # Summarize the first few
            summary_items = []
            for r in reminders_today[:3]:
                summary_items.append(f"{r.title} às {r.scheduled_time.strftime('%H:%M')}")
            
            agenda_sent += " Entre eles: " + ", ".join(summary_items[:-1]) + (f" e {summary_items[-1]}." if len(summary_items) > 1 else f"{summary_items[0]}.")
            
            if count > 3:
                agenda_sent += f" E mais {count-3} outras atividades."
    else:
        # Check for the next one ever
        next_reminder = db.query(Reminder).filter(
            Reminder.is_active == True,
            Reminder.scheduled_time > now
        ).order_by(Reminder.scheduled_time.asc()).first()
        
        if next_reminder:
            agenda_sent = f" Você não tem nada para hoje, mas sua próxima atividade será \"{next_reminder.title}\", no dia {next_reminder.scheduled_time.day}."
        else:
            agenda_sent = " Você não tem atividades agendadas no momento."
        
    return f"{day_sent}{agenda_sent}"

async def run_briefing_speech(text: str):
    """Waits for various components to be ready and then speaks."""
    # Wait for TTS to be initialized
    if app_state.tts and app_state.tts.tts:
        logger.info("[Briefing] Waiting for TTS to be ready...")
        # wait_until_ready is a blocking call, so we run it in a thread to not block the event loop
        ready = await asyncio.to_thread(app_state.tts.tts.wait_until_ready, 60.0)
        
        if ready:
            logger.info(f"[Briefing] Speaking: {text}")
            app_state.tts.tts.speak(text)
        else:
            logger.warning("[Briefing] TTS not ready after timeout. Briefing skipped.")
    else:
        logger.warning("[Briefing] TTS system not available. Briefing skipped.")

