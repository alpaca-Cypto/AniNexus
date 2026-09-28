"""Persist Bangumi catalog refresh runs and their item results.

Revision ID: 7f4a19c02c31
Revises: 48ab2b0216df
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7f4a19c02c31"
down_revision: str | None = "48ab2b0216df"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "catalog_refresh_runs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("started_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime()),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("scanned", sa.Integer(), nullable=False),
        sa.Column("created_count", sa.Integer(), nullable=False),
        sa.Column("updated_count", sa.Integer(), nullable=False),
        sa.Column("linked_count", sa.Integer(), nullable=False),
        sa.Column("unchanged_count", sa.Integer(), nullable=False),
        sa.Column("review_count", sa.Integer(), nullable=False),
        sa.Column("skipped_count", sa.Integer(), nullable=False),
        sa.Column("failed_count", sa.Integer(), nullable=False),
        sa.Column("error_kind", sa.String(length=100)),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_catalog_refresh_started", "catalog_refresh_runs", ["started_at"])
    op.create_table(
        "catalog_refresh_items",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("run_id", sa.BigInteger(), nullable=False),
        sa.Column("subject_id", sa.BigInteger()),
        sa.Column("bangumi_id", sa.String(length=64), nullable=False),
        sa.Column("subject_type", sa.Integer()),
        sa.Column("name", sa.String(length=500)),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("error_kind", sa.String(length=100)),
        sa.Column("recorded_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["catalog_refresh_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_catalog_refresh_item_run", "catalog_refresh_items", ["run_id", "id"])
    op.create_index("ix_catalog_refresh_item_subject", "catalog_refresh_items", ["subject_id"])


def downgrade() -> None:
    op.drop_index("ix_catalog_refresh_item_subject", table_name="catalog_refresh_items")
    op.drop_index("ix_catalog_refresh_item_run", table_name="catalog_refresh_items")
    op.drop_table("catalog_refresh_items")
    op.drop_index("ix_catalog_refresh_started", table_name="catalog_refresh_runs")
    op.drop_table("catalog_refresh_runs")
