from __future__ import annotations

import re
from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, Engine, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


def build_engine(database_url: str) -> Engine:
    if not database_url:
        raise ValueError("DATABASE_URL is required")
    if make_url(database_url).get_backend_name() == "sqlite":
        return create_engine(
            database_url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    return create_engine(database_url, pool_pre_ping=True, pool_recycle=1800)


def build_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


def get_session(request: Request) -> Iterator[Session]:
    factory: sessionmaker[Session] = request.app.state.session_factory
    with factory() as session:
        yield session


def ensure_mysql_database(database_url: str) -> None:
    """Create the target database when it is absent.

    The identifier is strictly validated because MySQL cannot bind a database
    name as a query parameter.
    """

    url = make_url(database_url)
    database = url.database
    if url.get_backend_name() != "mysql":
        raise ValueError("The import bootstrap currently supports MySQL URLs only")
    if not database or not re.fullmatch(r"[A-Za-z0-9_]+", database):
        raise ValueError("DATABASE_URL must contain a simple MySQL database name")

    server_url = URL.create(
        drivername=url.drivername,
        username=url.username,
        password=url.password,
        host=url.host,
        port=url.port,
        query=url.query,
    )
    server_engine = create_engine(server_url, pool_pre_ping=True)
    try:
        with server_engine.begin() as connection:
            connection.execute(
                text(
                    f"CREATE DATABASE IF NOT EXISTS `{database}` "
                    "CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
                )
            )
    finally:
        server_engine.dispose()
