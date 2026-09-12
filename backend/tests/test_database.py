from sqlalchemy.engine import make_url

from aninexus_backend.db import build_engine


def test_sqlite_engine_uses_shared_memory_pool() -> None:
    engine = build_engine("sqlite+pysqlite:///:memory:")
    try:
        assert make_url(str(engine.url)).get_backend_name() == "sqlite"
        assert engine.pool.__class__.__name__ == "StaticPool"
    finally:
        engine.dispose()
