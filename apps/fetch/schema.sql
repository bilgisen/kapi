-- S1-3: kapi-db şema (D1) — idempotent
-- Çalıştırma: npx wrangler d1 execute kapi-db --remote --file apps/fetch/schema.sql
-- Not: F3 migration (mevcut DB'de audit_json kolonu) idempotent DEĞİLDİR —
--       bir kez elle çalıştırıldı:
--   npx wrangler d1 execute kapi-db --remote --command="ALTER TABLE kap_notifications ADD COLUMN audit_json TEXT;"

CREATE TABLE IF NOT EXISTS kap_notifications (
    disclosure_index    TEXT PRIMARY KEY,
    mkk_member_id       INTEGER,
    title               TEXT,
    subject             TEXT,
    disclosure_class    TEXT,
    disclosure_type     TEXT,
    disclosure_category TEXT,
    summary             TEXT,
    disclosure_body     TEXT,
    publish_date        TEXT,                -- KAP'tan gelen UTC zamanı
    is_late             INTEGER DEFAULT 0,
    is_changed          INTEGER DEFAULT 0,
    related_disclosure_oid TEXT,
    audit_json           TEXT,                -- F2: disclosureDetail meta (denetim/görüş)
    attachment_count    INTEGER DEFAULT 0,
    modify_status       TEXT,
    is_bist100          INTEGER DEFAULT 0,   -- K2: BIST100 etiketi
    pdf_text            TEXT,                -- PDF ekstraksiyonu (varsa, ilk 8K)
    pdf_error           TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_companies (
    disclosure_index TEXT NOT NULL,
    ticker           TEXT NOT NULL,
    PRIMARY KEY (disclosure_index, ticker)
);

CREATE TABLE IF NOT EXISTS kap_disclosure_files (
    disclosure_index TEXT NOT NULL,
    obj_id           TEXT NOT NULL,
    file_name        TEXT,
    file_extension   TEXT,
    sort_order       INTEGER DEFAULT 0,
    PRIMARY KEY (disclosure_index, obj_id)
);

CREATE TABLE IF NOT EXISTS bist100_members (
    ticker       TEXT PRIMARY KEY,
    member_name  TEXT,
    is_active    INTEGER DEFAULT 1,
    added_at     TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kap_analysis (
    disclosure_index TEXT PRIMARY KEY,
    importance_score INTEGER,             -- S2: kural motoru (1-10)
    category         TEXT,
    time_horizon     TEXT,
    summary_tr       TEXT,                -- S3: AI
    impact_analysis  TEXT,
    key_numbers      TEXT,                -- JSON
    sentiment        TEXT,
    chatbot_context  TEXT,
    ai_model_used    TEXT,
    confidence       REAL,
    needs_review     INTEGER DEFAULT 0,
    analyzed_at      TEXT,
    source           TEXT DEFAULT 'auto', -- auto | ondemand (K11)
    updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kap_sync_state (
    id                INTEGER PRIMARY KEY CHECK (id = 1),
    last_window_start TEXT,
    last_window_end   TEXT,
    last_success      INTEGER DEFAULT 0,
    last_error        TEXT,
    fetched_count     INTEGER DEFAULT 0,
    updated_at        TEXT DEFAULT (datetime('now'))
);

-- İndeksler
CREATE INDEX IF NOT EXISTS ix_kap_notifications_publish ON kap_notifications(publish_date DESC);
CREATE INDEX IF NOT EXISTS ix_kap_notifications_bist100 ON kap_notifications(is_bist100);
CREATE INDEX IF NOT EXISTS ix_kap_notifications_class ON kap_notifications(disclosure_class);
CREATE INDEX IF NOT EXISTS ix_kap_analysis_score ON kap_analysis(importance_score);