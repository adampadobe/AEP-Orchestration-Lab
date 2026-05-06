"""
Per-request Snowflake connection kwargs for the Agentic travel runner.

The original AgenticAI Demo resolved credentials from env and local key files.
This lab runner injects kwargs from the Cloud Function (after Firebase auth)
before calling TravelDataGenerator.connect() or web_app query helpers.
"""

from __future__ import annotations

import threading

_tls = threading.local()


def set_connection_kwargs(kwargs: dict) -> None:
    """Bind Snowflake `snowflake.connector.connect(**kwargs)` for this request."""
    _tls.kwargs = dict(kwargs) if kwargs else None


def get_snowflake_connection_kwargs() -> dict:
    """Used by data_generator / web_app imports."""
    k = getattr(_tls, "kwargs", None)
    if not k:
        raise RuntimeError(
            "Snowflake connection kwargs are not bound to this thread. "
            "The runner must call set_connection_kwargs() before any generator work."
        )
    return k
