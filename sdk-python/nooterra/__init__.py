"""Minimal Python SDK stub for Nooterra.

This is intentionally lightweight and synchronous for quick demos and LangChain/CrewAI integration.
"""

from .client import NooterraClient, NooterraError

__all__ = ["NooterraClient", "NooterraError"]
