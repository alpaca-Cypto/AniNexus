"""Store each user's encrypted Bangumi token.

Revision ID: 48ab2b0216df
Revises: 8668ef8d2ea4
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "48ab2b0216df"
down_revision: str | None = "8668ef8d2ea4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bangumi_credentials",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("encrypted_token", sa.Text(), nullable=False),
        sa.Column("bangumi_username", sa.String(length=255), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("bangumi_credentials")
