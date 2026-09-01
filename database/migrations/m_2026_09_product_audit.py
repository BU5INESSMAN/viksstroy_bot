"""Product diagnostics journal for user journeys, friction and failures."""


async def run(conn) -> None:
    await conn.executescript("""
        CREATE TABLE IF NOT EXISTS product_audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_uuid TEXT NOT NULL UNIQUE,
            occurred_at TEXT NOT NULL,
            received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            source TEXT NOT NULL DEFAULT 'server',
            category TEXT NOT NULL DEFAULT 'interaction',
            event_name TEXT NOT NULL,
            outcome TEXT NOT NULL DEFAULT 'info',
            severity TEXT NOT NULL DEFAULT 'info',
            user_id INTEGER,
            user_fio TEXT DEFAULT '',
            user_role TEXT DEFAULT '',
            session_hash TEXT DEFAULT '',
            request_id TEXT DEFAULT '',
            page TEXT DEFAULT '',
            route TEXT DEFAULT '',
            method TEXT DEFAULT '',
            status_code INTEGER,
            duration_ms INTEGER,
            element TEXT DEFAULT '',
            target_type TEXT DEFAULT '',
            target_id TEXT DEFAULT '',
            error_type TEXT DEFAULT '',
            error_message TEXT DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            client_json TEXT NOT NULL DEFAULT '{}',
            app_version TEXT DEFAULT '',
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_product_audit_time
            ON product_audit_events(occurred_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_product_audit_user_time
            ON product_audit_events(user_id, occurred_at DESC);
        CREATE INDEX IF NOT EXISTS idx_product_audit_category_time
            ON product_audit_events(category, occurred_at DESC);
        CREATE INDEX IF NOT EXISTS idx_product_audit_outcome_time
            ON product_audit_events(outcome, occurred_at DESC);
        CREATE INDEX IF NOT EXISTS idx_product_audit_name_time
            ON product_audit_events(event_name, occurred_at DESC);
        INSERT INTO settings(key, value)
            SELECT 'product_audit_retention_days', '180'
            WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key='product_audit_retention_days');
    """)
