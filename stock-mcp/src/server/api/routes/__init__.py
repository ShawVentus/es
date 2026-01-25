# src/server/api/routes/__init__.py
"""API routes."""

from .market_data import router as market_data_router
from .filings import router as filings_router
from .mcp_gateway import router as mcp_gateway_router
from .auth import router as auth_router
from .statistics import router as statistics_router

__all__ = ["market_data_router", "filings_router", "mcp_gateway_router", "auth_router", "statistics_router"]
