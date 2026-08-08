"""
Database configuration and models for NewBorsa

This module provides database configuration, models, and session management
for the NewBorsa application. It supports both SQLite (development) and
PostgreSQL/NileDB (production) databases.
"""
import os
import logging
from datetime import datetime
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Boolean, Text, ForeignKey, UniqueConstraint, BigInteger
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from config import settings

# Database URL from settings (dev/prod aware)
DATABASE_URL = settings.DATABASE_URL

# Log the database URL being used (without sensitive info)
if DATABASE_URL:
    safe_url = DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL
    logging.info(f"Using database: {safe_url}")

# Determine database type to handle JSON columns properly based on the actual DATABASE_URL
if DATABASE_URL.startswith("sqlite"):
    # For SQLite, use Text type and handle JSON serialization manually
    from sqlalchemy import Text as JSONType
    database_type = "SQLite"
elif "postgresql" in DATABASE_URL or "postgres" in DATABASE_URL:
    # For PostgreSQL, try to use native JSON type
    try:
        from sqlalchemy.dialects.postgresql import JSON as JSONType
        database_type = "PostgreSQL"
    except ImportError:
        from sqlalchemy import Text as JSONType  # fallback to Text
        database_type = "PostgreSQL (Text fallback)"
else:
    # Default to Text for unknown database types
    from sqlalchemy import Text as JSONType
    database_type = "Unknown (Text fallback)"

logging.info(f"Database type detected: {database_type}")

def get_engine(database_url: str):
    if database_url.startswith("sqlite"):
        return create_engine(database_url, connect_args={"check_same_thread": False})
    return create_engine(database_url)

# Handle database-specific configuration
try:
    if DATABASE_URL.startswith("sqlite"):
        # SQLite specific settings
        engine = create_engine(
            DATABASE_URL, connect_args={"check_same_thread": False}
        )
        logging.info("SQLite engine created successfully")
    elif "postgresql" in DATABASE_URL or "postgres" in DATABASE_URL:
        # PostgreSQL/NileDB specific settings
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,  # Check connections before use
            pool_recycle=3600,    # Recycle connections every hour
            echo=False           # Set to True for SQL logging in debug
        )
        logging.info("PostgreSQL/NileDB engine created successfully")
    else:
        # Default settings for unknown database types
        engine = create_engine(DATABASE_URL)
        logging.info(f"Default engine created for database type: {database_type}")
except Exception as e:
    logging.error(f"Failed to create database engine: {e}")
    raise

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dependency to get database session
def get_db() -> Generator[Session, None, None]:
    """
    Dependency function that yields database sessions.
    Handles session lifecycle automatically.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Base class for models
Base = declarative_base()

# Define SQLAlchemy models
class SectorTaxonomy(Base):
    __tablename__ = "sector_taxonomy"

    id = Column(Integer, primary_key=True, index=True)
    name_tr = Column(String(255), nullable=False)
    slug = Column(String(255), nullable=False, unique=True, index=True)
    parent_id = Column(Integer, ForeignKey("sector_taxonomy.id"), nullable=True)
    level = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SectorAlias(Base):
    __tablename__ = "sector_alias"

    id = Column(Integer, primary_key=True, index=True)
    raw_name = Column(String(255), nullable=False, unique=True, index=True)
    sector_id = Column(Integer, ForeignKey("sector_taxonomy.id"), nullable=False, index=True)
    source = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SectorRatioStat(Base):
    __tablename__ = "sector_ratio_stats"

    id = Column(Integer, primary_key=True, index=True)
    period_key = Column(String(32), nullable=False, index=True)
    report_type = Column(String(32), nullable=False, default="standart", index=True)
    currency = Column(String(8), nullable=False, default="TL", index=True)
    sector_id = Column(Integer, ForeignKey("sector_taxonomy.id"), nullable=False, index=True)
    ratio_key = Column(String(64), nullable=False, index=True)
    median = Column(Float, nullable=True)
    p25 = Column(Float, nullable=True)
    p75 = Column(Float, nullable=True)
    mean = Column(Float, nullable=True)
    std_dev = Column(Float, nullable=True)
    min = Column(Float, nullable=True)
    max = Column(Float, nullable=True)
    count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "period_key",
            "report_type",
            "currency",
            "sector_id",
            "ratio_key",
            name="uq_sector_ratio_stats_period_sector_ratio_rt_ccy",
        ),
    )


class IndexRatioStat(Base):
    __tablename__ = "index_ratio_stats"

    id = Column(Integer, primary_key=True, index=True)
    period_key = Column(String(32), nullable=False, index=True)
    report_type = Column(String(32), nullable=False, default="standart", index=True)
    currency = Column(String(8), nullable=False, default="TL", index=True)
    index_code = Column(String(32), nullable=False, index=True)
    ratio_key = Column(String(64), nullable=False, index=True)
    median = Column(Float, nullable=True)
    p25 = Column(Float, nullable=True)
    p75 = Column(Float, nullable=True)
    mean = Column(Float, nullable=True)
    std_dev = Column(Float, nullable=True)
    min = Column(Float, nullable=True)
    max = Column(Float, nullable=True)
    count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "period_key",
            "report_type",
            "currency",
            "index_code",
            "ratio_key",
            name="uq_index_ratio_stats_period_index_ratio_rt_ccy",
        ),
    )


class CompanyRatioValue(Base):
    __tablename__ = "company_ratio_values"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    period_key = Column(String(32), nullable=False, index=True)
    ratio_key = Column(String(64), nullable=False, index=True)
    report_type = Column(String(32), nullable=False, default="standart", index=True)
    currency = Column(String(8), nullable=False, default="TL", index=True)
    value = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "period_key",
            "ratio_key",
            "report_type",
            "currency",
            name="uq_company_ratio_values_company_period_ratio_rt_ccy",
        ),
    )


class CompanyAIContextCache(Base):
    __tablename__ = "company_ai_context_cache"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    period_key = Column(String(32), nullable=False, index=True)
    report_type = Column(String(32), nullable=False, default="standart", index=True)
    currency = Column(String(8), nullable=False, default="TL", index=True)
    sections_hash = Column(String(64), nullable=False, index=True)
    payload = Column(JSONType, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "period_key",
            "report_type",
            "currency",
            "sections_hash",
            name="uq_company_ai_context_cache_company_period_rt_ccy_sections",
        ),
    )


class SectorAIContextCache(Base):
    __tablename__ = "sector_ai_context_cache"

    id = Column(Integer, primary_key=True, index=True)
    sector_slug = Column(String(255), nullable=False, index=True)
    period_key = Column(String(32), nullable=False, index=True)
    report_type = Column(String(32), nullable=False, default="standart", index=True)
    currency = Column(String(8), nullable=False, default="TL", index=True)
    sections_hash = Column(String(64), nullable=False, index=True)
    payload = Column(JSONType, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "sector_slug",
            "period_key",
            "report_type",
            "currency",
            "sections_hash",
            name="uq_sector_ai_context_cache_slug_period_rt_ccy_sections",
        ),
    )


class IndexAIContextCache(Base):
    __tablename__ = "index_ai_context_cache"

    id = Column(Integer, primary_key=True, index=True)
    index_code = Column(String(64), nullable=False, index=True)
    period_key = Column(String(32), nullable=True, index=True)
    report_type = Column(String(32), nullable=False, default="standart", index=True)
    currency = Column(String(8), nullable=False, default="TL", index=True)
    sections_hash = Column(String(64), nullable=False, index=True)
    payload = Column(JSONType, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "index_code",
            "period_key",
            "report_type",
            "currency",
            "sections_hash",
            name="uq_index_ai_context_cache_code_period_rt_ccy_sections",
        ),
    )


class CompanySWOTReport(Base):
    __tablename__ = "company_swot_reports"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    period_key = Column(String(32), nullable=False, index=True)
    report_type = Column(String(32), nullable=False, default="standart", index=True)
    currency = Column(String(8), nullable=False, default="TL", index=True)

    schema_version = Column(Integer, nullable=False, default=1, index=True)
    engine_version = Column(String(32), nullable=False, default="swot_rules_v1", index=True)

    payload = Column(JSONType, nullable=False)
    generated_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    valid_until = Column(DateTime, nullable=False, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "period_key",
            "report_type",
            "currency",
            "schema_version",
            "engine_version",
            name="uq_company_swot_reports_company_period_rt_ccy_schema_engine",
        ),
    )


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String(512), nullable=False, index=True)
    short_description = Column(Text, nullable=True)
    description = Column(Text, nullable=True)

    user_summary_html = Column(Text, nullable=True)

    report_type = Column(String(32), nullable=True, index=True)  # economic|sector|company
    category_name = Column(String(255), nullable=True, index=True)

    publish_date = Column(DateTime, nullable=True, index=True)
    pdf_url = Column(String(2048), nullable=True, index=True)
    file_type = Column(String(32), nullable=True)

    source = Column(String(64), nullable=True, index=True)
    source_sgid = Column(String(32), nullable=True, index=True)
    subscription_group_id = Column(String(32), nullable=True)

    is_customer_only = Column(Boolean, nullable=True, index=True)
    customer_text = Column(Text, nullable=True)

    tags = Column(JSONType, nullable=True)
    raw = Column(JSONType, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("source", "pdf_url", name="uq_reports_source_pdf_url"),
    )


class ReportSector(Base):
    __tablename__ = "report_sectors"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False, index=True)
    sector_slug = Column(String(255), nullable=False, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("report_id", "sector_slug", name="uq_report_sectors_report_slug"),
    )


class AdminReportState(Base):
    __tablename__ = "admin_report_states"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False, index=True)

    published = Column(Boolean, nullable=False, default=False, index=True)
    processed = Column(Boolean, nullable=False, default=False, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("report_id", name="uq_admin_report_states_report_id"),
    )


class ReportCompany(Base):
    __tablename__ = "report_companies"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False, index=True)
    ticker = Column(String(20), nullable=False, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("report_id", "ticker", name="uq_report_companies_report_ticker"),
    )


class ReportAIOutput(Base):
    __tablename__ = "report_ai_outputs"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False, index=True)

    status = Column(String(32), nullable=False, default="pending", index=True)

    model = Column(String(64), nullable=True, index=True)
    prompt_version = Column(String(32), nullable=True, index=True)

    input_meta = Column(JSONType, nullable=True)

    summary_html = Column(Text, nullable=True)
    summary_json = Column(JSONType, nullable=True)

    extracted_tickers = Column(JSONType, nullable=True)
    extracted_sector_slugs = Column(JSONType, nullable=True)

    error = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CompanyAIAnalysisCache(Base):
    __tablename__ = "company_ai_analysis_cache"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    analysis_kind = Column(String(32), nullable=False, index=True)

    period_key = Column(String(32), nullable=False, index=True)
    report_type = Column(String(32), nullable=False, default="standart", index=True)
    currency = Column(String(8), nullable=False, default="TL", index=True)
    lang = Column(String(8), nullable=False, default="tr", index=True)

    status = Column(String(32), nullable=False, default="pending", index=True)
    model = Column(String(64), nullable=True, index=True)
    prompt_version = Column(String(32), nullable=True, index=True)

    payload = Column(JSONType, nullable=True)
    error = Column(Text, nullable=True)

    generated_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    valid_until = Column(DateTime, nullable=False, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "analysis_kind",
            "period_key",
            "report_type",
            "currency",
            "lang",
            "prompt_version",
            "model",
            name="uq_company_ai_analysis_cache_company_kind_period_rt_ccy_lang_prompt_model",
        ),
    )


class Company(Base):
    """SQLAlchemy model for companies"""
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String(20), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    sector = Column(String(255), nullable=True)
    sector_id = Column(Integer, ForeignKey("sector_taxonomy.id"), nullable=True, index=True)
    public_rate = Column(Float, nullable=True)
    
    # İş Yatırım fields
    kdate = Column(Date, nullable=True)
    faaliyet = Column(Text, nullable=True)
    partners = Column(JSONType, nullable=True)
    indexes = Column(JSONType, nullable=True)  # Endeks ağırlıkları
    capital = Column(BigInteger, nullable=True)

    # Sector index (ana sektör endeksi) mapping (1 per company)
    sector_endeks_code = Column(String(32), nullable=True, index=True)
    sector_endeks_name = Column(String(255), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<Company {self.ticker}: {self.name}>"


class Index(Base):
    __tablename__ = "indexes"

    code = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    source = Column(String(32), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class IndexMembership(Base):
    __tablename__ = "index_memberships"

    index_code = Column(String(64), ForeignKey("indexes.code"), primary_key=True, nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), primary_key=True, nullable=False, index=True)
    weight_pct = Column(Float, nullable=True)
    source = Column(String(32), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class KapDisclosure(Base):
    __tablename__ = "kap_disclosures"

    id = Column(Integer, primary_key=True, index=True)

    ticker = Column(String(20), index=True, nullable=False)
    disclosure_index = Column(Integer, index=True, nullable=False)

    disclosure_class = Column(String(10), index=True, nullable=True)
    disclosure_type = Column(String(10), index=True, nullable=True)

    sender_title = Column(String(512), nullable=True)
    subject_tr = Column(String(512), nullable=True)
    summary_tr = Column(Text, nullable=True)
    published_at = Column(DateTime, index=True, nullable=True)
    kap_link = Column(String(1024), nullable=True)

    company_id_mkk = Column(Integer, nullable=True)
    raw = Column(JSONType, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("ticker", "disclosure_index", name="uq_kap_disclosures_ticker_disclosure_index"),
    )


class KapDisclosureSyncState(Base):
    __tablename__ = "kap_disclosure_sync_state"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String(20), unique=True, index=True, nullable=False)

    last_disclosure_index = Column(Integer, nullable=True)
    last_synced_at = Column(DateTime, nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PriceBar(Base):
    __tablename__ = "price_bars"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String(20), index=True, nullable=False)
    date = Column(Date, index=True, nullable=False)
    interval = Column(String(10), nullable=False, default="1d")
    close = Column(Float, nullable=True)
    volume_lot = Column(Float, nullable=True)
    volume_tl = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("ticker", "date", "interval", name="uq_price_bars_ticker_date_interval"),
    )


class MarketSnapshot(Base):
    __tablename__ = "market_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String(20), index=True, nullable=False)
    as_of_date = Column(Date, index=True, nullable=False)
    currency = Column(String(8), nullable=False, default="TL", index=True)
    source = Column(String(64), nullable=False, default="unknown", index=True)

    last_price = Column(Float, nullable=True)
    volume_lot = Column(Float, nullable=True)
    volume_tl = Column(Float, nullable=True)

    market_capital = Column(BigInteger, nullable=True)
    shares_outstanding = Column(BigInteger, nullable=True)
    free_float_pct = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("ticker", "as_of_date", "currency", name="uq_market_snapshots_ticker_date_ccy"),
    )


class CompanyCorporateAction(Base):
    __tablename__ = "company_corporate_actions"

    id = Column(Integer, primary_key=True, index=True)

    ticker = Column(String(20), index=True, nullable=False)
    action_date = Column(Date, index=True, nullable=False)
    source = Column(String(64), nullable=False, default="matriks", index=True)

    bonus_issue = Column(Float, nullable=True)
    rights_issue = Column(Float, nullable=True)
    capital_reduction = Column(Float, nullable=True)
    dividend = Column(Float, nullable=True)
    rate = Column(Float, nullable=True)
    dividend_yield = Column(Float, nullable=True)

    raw = Column(JSONType, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("ticker", "action_date", "source", name="uq_company_corporate_actions_ticker_date_source"),
    )


class IsYatirimHisseTekilDaily(Base):
    __tablename__ = "isyatirim_hisse_tekil_daily"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String(20), index=True, nullable=False)
    date = Column(Date, index=True, nullable=False)
    source = Column(String(64), nullable=False, default="isyatirim", index=True)

    close = Column(Float, nullable=True)
    vwap = Column(Float, nullable=True)
    low = Column(Float, nullable=True)
    high = Column(Float, nullable=True)
    volume_tl = Column(Float, nullable=True)

    usd_rate = Column(Float, nullable=True)
    close_usd = Column(Float, nullable=True)
    vwap_usd = Column(Float, nullable=True)
    low_usd = Column(Float, nullable=True)
    high_usd = Column(Float, nullable=True)
    volume_usd = Column(Float, nullable=True)

    capital = Column(BigInteger, nullable=True)
    market_cap = Column(Float, nullable=True)
    market_cap_usd = Column(Float, nullable=True)
    free_float_market_cap = Column(Float, nullable=True)
    free_float_market_cap_usd = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("ticker", "date", name="uq_isyatirim_hisse_tekil_daily_ticker_date"),
    )


class IndexPriceBar(Base):
    __tablename__ = "index_price_bars"

    id = Column(Integer, primary_key=True, index=True)
    index_code = Column(String(32), index=True, nullable=False)
    date = Column(Date, index=True, nullable=False)
    interval = Column(String(10), nullable=False, default="1d")
    open = Column(Float, nullable=True)
    high = Column(Float, nullable=True)
    low = Column(Float, nullable=True)
    close = Column(Float, nullable=True)
    volume = Column(Float, nullable=True)
    quantity = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("index_code", "date", "interval", name="uq_index_price_bars_code_date_interval"),
    )


class IndexQuote(Base):
    __tablename__ = "index_quotes"

    id = Column(Integer, primary_key=True, index=True)
    index_code = Column(String(32), unique=True, index=True, nullable=False)
    update_date = Column(DateTime, nullable=True)
    open = Column(Float, nullable=True)
    high = Column(Float, nullable=True)
    low = Column(Float, nullable=True)
    last = Column(Float, nullable=True)
    day_close = Column(Float, nullable=True)
    week_close = Column(Float, nullable=True)
    month_close = Column(Float, nullable=True)
    year_close = Column(Float, nullable=True)
    prev_year_close = Column(Float, nullable=True)
    volume = Column(Float, nullable=True)
    quantity = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class FinansalLegacy(Base):
    __tablename__ = "finansal_legacy"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String(20), index=True, nullable=False)
    year = Column(Integer, index=True, nullable=False)
    satislar = Column(Float, nullable=True)
    favok = Column(Float, nullable=True)
    netkar = Column(Float, nullable=True)
    fdsatislar = Column(Float, nullable=True)
    fdfavok = Column(Float, nullable=True)
    fk = Column(Float, nullable=True)
    pddd = Column(Float, nullable=True)
    yabancioran = Column(Float, nullable=True)
    orthacim_3a = Column(Float, nullable=True)
    orthacim_12a = Column(Float, nullable=True)
    piyasadeger = Column(Float, nullable=True)
    netborc = Column(Float, nullable=True)
    halka_acik = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("ticker", "year", name="uq_finansal_legacy_ticker_year"),
    )


Finansal = FinansalLegacy

def create_tables(engine_param=None):
    """Create all database tables."""
    Base.metadata.create_all(bind=engine_param or engine)

def drop_tables(engine_param=None):
    """Drop all database tables. Use with caution!"""
    Base.metadata.drop_all(bind=engine_param or engine)