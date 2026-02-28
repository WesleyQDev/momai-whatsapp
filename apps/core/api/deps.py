import asyncio
import functools

from database.models import SessionLocal
import app_state


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def require_ai_loaded(func):
    """Decorator to ensure AI stack is loaded before route execution."""
    if asyncio.iscoroutinefunction(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            if not app_state.ai_stack_loaded:
                await app_state.initialize_ai_stack()
            return await func(*args, **kwargs)
        return async_wrapper

    @functools.wraps(func)
    def sync_wrapper(*args, **kwargs):
        if not app_state.ai_stack_loaded:
            loop = asyncio.get_event_loop()
            loop.run_until_complete(app_state.initialize_ai_stack())
        return func(*args, **kwargs)

    return sync_wrapper

