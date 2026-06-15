"""Shared fixtures for integration tests."""
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.api import api_router
from app.db.session import get_db


def make_mock_db():
    """Return an async mock that behaves like an AsyncSession."""
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.close = AsyncMock()
    # Default: execute returns a result where scalar_one_or_none() is None
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    result.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=result)
    return db


@pytest.fixture
def mock_db():
    return make_mock_db()


@pytest.fixture
def app(mock_db):
    """Minimal FastAPI app with the full API router and mocked DB."""
    _app = FastAPI()
    _app.include_router(api_router, prefix="/api/v1")

    async def override_db():
        yield mock_db

    _app.dependency_overrides[get_db] = override_db
    return _app


@pytest.fixture
def client(app):
    return TestClient(app, raise_server_exceptions=True)
