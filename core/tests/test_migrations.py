from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect

from app.db import Base, make_engine
from tests.conftest import TEST_DATABASE_URL, alembic_config


def test_migrations_downgrade_and_upgrade_match_models(database):
    engine = make_engine(TEST_DATABASE_URL)
    config = alembic_config()
    try:
        command.downgrade(config, "base")
        assert set(inspect(engine).get_table_names()) == {"alembic_version"}

        command.upgrade(config, "head")
        assert set(Base.metadata.tables) <= set(inspect(engine).get_table_names())

        # Schemat zbudowany migracjami nie różni się od modeli SQLAlchemy.
        with engine.connect() as connection:
            differences = compare_metadata(MigrationContext.configure(connection), Base.metadata)
        assert differences == []
    finally:
        engine.dispose()
