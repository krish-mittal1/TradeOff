"""Unit tests for app/config.py — Settings model validation."""


def test_settings_loads_without_error():
    from app.config import settings
    assert settings is not None


def test_settings_has_required_fields():
    from app.config import settings
    assert settings.JWT_SECRET
    assert settings.JWT_ALGORITHM in ("HS256", "HS384", "HS512", "RS256")
    assert settings.ACCESS_TOKEN_EXPIRE_MINUTES > 0
    assert settings.REFRESH_TOKEN_EXPIRE_DAYS > 0
    assert settings.BCRYPT_ROUNDS >= 4


def test_cors_origins_list_default():
    from app.config import settings
    origins = settings.cors_origins_list
    assert isinstance(origins, list)
    assert len(origins) > 0


def test_cors_origins_list_with_comma_string(monkeypatch):
    """cors_origins_list should split a comma-separated string."""

    from app import config as cfg

    monkeypatch.setattr(cfg.settings, "CORS_ORIGINS", "http://a.com,http://b.com")
    origins = cfg.settings.cors_origins_list
    assert "http://a.com" in origins
    assert "http://b.com" in origins


def test_database_url_is_set():
    from app.config import settings
    assert settings.DATABASE_URL
    assert "://" in settings.DATABASE_URL


def test_environment_is_valid():
    from app.config import settings
    assert settings.ENVIRONMENT in ("development", "staging", "production")
