from __future__ import annotations

from logging.config import fileConfig

from alembic import context

from aninexus_backend import models as models  # noqa: F401
from aninexus_backend.config import Settings
from aninexus_backend.db import Base, build_engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    database_url = Settings.from_environment().database_url
    if not database_url:
        raise RuntimeError("DATABASE_URL or DATABASE_PASSWORD_FILE is required")
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    database_url = Settings.from_environment().database_url
    if not database_url:
        raise RuntimeError("DATABASE_URL or DATABASE_PASSWORD_FILE is required")
    engine = build_engine(database_url)
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=target_metadata)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
