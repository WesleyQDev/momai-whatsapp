import os
from unittest.mock import MagicMock, patch

import pytest

from utils.i18n import normalize_locale, t, get_locale


class TestNormalizeLocale:
    def test_returns_default_for_none(self):
        with patch.dict(os.environ, {"MOMAI_LOCALE": "pt-BR"}):
            assert normalize_locale(None) == "pt-BR"

    def test_returns_same_locale_if_supported(self):
        assert normalize_locale("pt-BR") == "pt-BR"
        assert normalize_locale("en") == "en"

    def test_resolves_aliases(self):
        assert normalize_locale("en-US") == "en"
        assert normalize_locale("en-GB") == "en"

    def test_returns_base_for_unsupported(self):
        assert normalize_locale("es-MX") == "es-MX"

    def test_returns_original_for_unknown_base(self):
        assert normalize_locale("xyz-ZYZ") == "xyz-ZYZ"


class TestT:
    def test_returns_translation_for_existing_key(self):
        result = t("missing_capability_card_content", locale="pt-BR")
        assert "Ainda nao aprendi" in result

    def test_returns_key_for_missing_translation(self):
        result = t("nonexistent_key", locale="pt-BR")
        assert result == "nonexistent_key"

    def test_fallback_to_pt_br_for_unknown_locale(self):
        result = t("missing_capability_card_content", locale="xx-XX")
        assert "Ainda nao aprendi" in result

    def test_replaces_placeholders(self):
        result = t("tool_protocol_interface_threshold", locale="en", min_chars=100)
        assert "100" in result

    def test_returns_original_on_format_error(self):
        result = t("llm_loading_message", locale="en", invalid_param="x")
        assert "Please wait" in result


class TestGetLocale:
    def test_returns_env_locale_when_set(self):
        with patch.dict(os.environ, {"MOMAI_LOCALE": "en"}):
            assert get_locale() == "en"

    def test_returns_db_locale_when_available(self, mock_settings):
        with patch.dict(os.environ, {}, clear=True):
            with patch("database.models.SessionLocal") as mock_session_class:
                mock_session = MagicMock()
                mock_session.query.return_value.first.return_value = mock_settings
                mock_session_class.return_value = mock_session

                result = get_locale()
                assert result == "pt-BR"

    def test_returns_default_when_no_env_or_db(self):
        with patch.dict(os.environ, {}, clear=True):
            with patch("database.models.SessionLocal") as mock_session_class:
                mock_session = MagicMock()
                mock_session.query.return_value.first.return_value = None
                mock_session_class.return_value = mock_session

                result = get_locale()
                assert result == "pt-BR"
