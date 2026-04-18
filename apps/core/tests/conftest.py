import sys
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def mock_app_state():
    with patch("app_state.ensure_tts_runtime", MagicMock(return_value=None)):
        yield


@pytest.fixture
def mock_db_session():
    mock_session = MagicMock()
    mock_session.query.return_value = MagicMock()
    return mock_session


@pytest.fixture
def mock_settings():
    settings = MagicMock()
    settings.locale = "pt-BR"
    return settings
