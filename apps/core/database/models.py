from sqlalchemy import Column, Integer, String, Boolean, DateTime, event, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool
from datetime import datetime
import os

Base = declarative_base()


class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True)
    # Perfil
    user_name = Column(String, default=None)
    assistant_persona = Column(
        String,
        default="You are MomAI, a professional and efficient local AI assistant created by Wesley Developer Studios. Always maintain a direct assistant-to-owner relationship and avoid over-nurturing behavior.",
    )

    # IA Provider
    ai_provider = Column(String, default="local")
    ai_model = Column(String, default="Qwen 3 4B Instruct")
    local_backend = Column(String, default="auto")  # auto, cuda, vulkan, cpu
    auto_start_llm = Column(Boolean, default=True)

    # Audio / TTS
    tts_engine = Column(String, default="kokoro")  # kokoro, edge-tts, say
    tts_voice = Column(String, default="pf_dora")
    tts_enabled = Column(Boolean, default=True)
    wake_word_enabled = Column(Boolean, default=False)
    wake_word_sensitivity = Column(Integer, default=5)  # 1-10

    # UI/Locale
    locale = Column(String, default="pt-BR")
    skip_intro = Column(Boolean, default=False)
    keep_in_tray = Column(Boolean, default=True)

    ai_tier = Column(String, default=None)  # lite, pro, ultra

    # Onboarding/Tutorial
    onboarding_completed = Column(Boolean, default=False)
    tutorial_completed = Column(Boolean, default=False)

    # Daily Briefing
    daily_briefing_enabled = Column(Boolean, default=False)
    last_briefing_date = Column(String, default=None)  # YYYY-MM-DD


# Database setup
data_dir = os.environ.get("MOMAI_DATA_DIR")
if data_dir:
    os.makedirs(data_dir, exist_ok=True)
    DB_PATH = os.path.join(data_dir, "momai.db")
else:
    # Points to the core folder (one level up from database/)
    DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "momai.db")
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    poolclass=NullPool,
    connect_args={"check_same_thread": False, "timeout": 10},
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable WAL mode on every new SQLite connection for better concurrent access."""
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
    finally:
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    Base.metadata.create_all(bind=engine)

    # Lightweight migration for new Settings columns
    with engine.connect() as conn:
        res = conn.execute(text("PRAGMA table_info(settings)"))
        cols = {row[1] for row in res.fetchall()}

        if "locale" not in cols:
            conn.execute(
                text("ALTER TABLE settings ADD COLUMN locale TEXT DEFAULT 'pt-BR'")
            )
        if "skip_intro" not in cols:
            conn.execute(
                text("ALTER TABLE settings ADD COLUMN skip_intro BOOLEAN DEFAULT 0")
            )
        if "keep_in_tray" not in cols:
            conn.execute(
                text("ALTER TABLE settings ADD COLUMN keep_in_tray BOOLEAN DEFAULT 1")
            )
        if "min_interface_chars" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE settings ADD COLUMN min_interface_chars INTEGER DEFAULT 240"
                )
            )
        if "prebuffer_chars" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE settings ADD COLUMN prebuffer_chars INTEGER DEFAULT 0"
                )
            )
        if "onboarding_completed" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE settings ADD COLUMN onboarding_completed BOOLEAN DEFAULT 0"
                )
            )

        if "tutorial_completed" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE settings ADD COLUMN tutorial_completed BOOLEAN DEFAULT 0"
                )
            )
        if "daily_briefing_enabled" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE settings ADD COLUMN daily_briefing_enabled BOOLEAN DEFAULT 0"
                )
            )
        if "last_briefing_date" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE settings ADD COLUMN last_briefing_date TEXT DEFAULT NULL"
                )
            )
        if "ai_tier" not in cols:
            conn.execute(
                text("ALTER TABLE settings ADD COLUMN ai_tier TEXT DEFAULT 'pro'")
            )
        if "auto_start_llm" not in cols:
            conn.execute(
                text("ALTER TABLE settings ADD COLUMN auto_start_llm BOOLEAN DEFAULT 1")
            )
        if "tts_engine" not in cols:
            conn.execute(
                text("ALTER TABLE settings ADD COLUMN tts_engine TEXT DEFAULT 'kokoro'")
            )

        # Migrate legacy default name to NULL so onboarding can handle it
        conn.execute(
            text("UPDATE settings SET user_name = NULL, onboarding_completed = 0 WHERE user_name = 'Senhor' OR user_name = 'Usuário' OR user_name = 'Usuario'")
        )

        conn.commit()
