-- Таблица пользователей системы
--
-- v2.6 (2026-05-18): columns `invite_code` and `default_equipment_id` are
-- declared directly inside this CREATE TABLE so fresh installs get them on
-- first executescript pass. For existing production DBs the columns are
-- added by database/migrations/m_2026_05_drivers_refactor.py.
--
-- IMPORTANT: do NOT add a `CREATE INDEX ON users(invite_code)` to this
-- schema.sql. CREATE TABLE IF NOT EXISTS is a no-op on existing tables
-- (so the column isn't added on upgrade), and the index would then fail
-- with "no such column: invite_code". The index lives in the migration
-- after its ALTER TABLE step.
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    fio TEXT,
    last_name TEXT DEFAULT '',
    first_name TEXT DEFAULT '',
    middle_name TEXT DEFAULT '',
    specialty TEXT DEFAULT '',
    settings TEXT DEFAULT '{}',
    role TEXT,
    is_active INTEGER DEFAULT 0,
    is_blacklisted INTEGER DEFAULT 0,
    failed_attempts INTEGER DEFAULT 0,
    notify_tg INTEGER DEFAULT 1,
    notify_max INTEGER DEFAULT 1,
    notify_new_users INTEGER DEFAULT 1,
    notify_orders INTEGER DEFAULT 1,
    notify_reports INTEGER DEFAULT 1,
    notify_errors INTEGER DEFAULT 1,
    notify_exchange INTEGER DEFAULT 1,
    avatar_url TEXT,
    last_used_objects TEXT DEFAULT '[]',
    linked_user_id INTEGER DEFAULT NULL,
    invite_code TEXT,                -- v2.6: personal driver/foreman invite code (auth anchor)
    default_equipment_id INTEGER,    -- DEPRECATED v2.6 commit 7 — inverted to equipment.default_driver_user_id; to be dropped in v2.7+
    -- v2.8: driver status mechanism (mirrors team_members.status shape) so
    -- role='driver' users get the same Акт/Бол/Отп statuses. Added to existing
    -- prod DBs by database/migrations/m_2026_05_driver_status.py.
    member_status TEXT DEFAULT 'available',
    status_from TEXT,
    status_until TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица бригад
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    icon TEXT DEFAULT NULL,
    creator_id INTEGER,
    invite_code TEXT,
    join_password TEXT,
    FOREIGN KEY (creator_id) REFERENCES users (user_id)
);

-- Настройки иконок для категорий техники
CREATE TABLE IF NOT EXISTS equipment_category_settings (
    category TEXT PRIMARY KEY,
    icon TEXT DEFAULT NULL
);

-- Состав бригад
CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    fio TEXT,
    position TEXT,
    invite_code TEXT UNIQUE,
    tg_user_id INTEGER NULL,
    tg_id INTEGER NULL,
    is_leader INTEGER DEFAULT 0,
    is_foreman INTEGER DEFAULT 0,
    FOREIGN KEY (team_id) REFERENCES teams (id)
);

-- Справочник техники
--
-- v2.6 (2026-05-19, commit 7 closes the release):
-- The following columns on `equipment` are DEPRECATED. They remain in
-- the schema for rollback safety only; the application code no longer
-- reads any of them. Drop scheduled for v2.7+.
--
--   • driver TEXT              — was the free-text driver name field
--                                used by Resources/Equipment cards.
--                                Driver identity now lives in `users.fio`
--                                + `application_drivers` junction
--                                (per-application assignment) +
--                                `equipment.default_driver_user_id`
--                                (per-equipment office-assigned default).
--   • driver_fio TEXT          — same legacy intent as `driver` above;
--                                the parallel column from earlier
--                                schema versions. Drivers' real ФИО
--                                lives in `users.fio` resolved via the
--                                v2.6 inverted relation.
--   • tg_id INTEGER            — was the Telegram ID of the driver tied
--                                to the equipment. Driver Telegram IDs
--                                live in `users.user_id`; equipment
--                                tracks who its default driver is via
--                                `equipment.default_driver_user_id`.
--   • invite_code TEXT         — was the equipment-bound driver invite.
--                                Drivers now redeem `users.invite_code`.
--                                Saved old links are gracefully bridged
--                                by POST /api/auth/equip_invite_bridge
--                                which resolves equipment.invite_code →
--                                equipment.default_driver_user_id →
--                                session for that user, then NULLs the
--                                legacy code.
--
-- New, authoritative v2.6 fields:
--   • default_driver_user_id   — office-owned default driver per
--                                equipment unit. Set via PATCH
--                                /api/equipment/{id}/default-driver
--                                (require_office, audited).
--
-- See:
--   • database/migrations/m_2026_05_drivers_refactor.py — initial cut
--   • database/migrations/m_2026_05_invert_default.py — ownership flip
--   • database/migrations/m_2026_05_sever_legacy.py — session invalidation
CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    category TEXT,
    driver_fio TEXT DEFAULT 'Не указан',  -- DEPRECATED v2.6 — to be dropped in v2.7+
    status TEXT DEFAULT 'free',
    tg_id INTEGER NULL,                   -- DEPRECATED v2.6 — to be dropped in v2.7+
    photo_url TEXT,
    invite_code TEXT,                     -- DEPRECATED v2.6 — to be dropped in v2.7+ (bridge: /api/auth/equip_invite_bridge)
    is_active INTEGER DEFAULT 1,
    license_plate TEXT DEFAULT '',
    -- v2.6.0: office assigns this on the Equipment page. Existing prod
    -- DBs get the column via migration m_2026_05_invert_default.py which
    -- also backfills the value from users.default_equipment_id.
    default_driver_user_id INTEGER REFERENCES users(user_id) DEFAULT NULL
);

-- v2.6: водители ↔ категории техники (м-к-м). Категория хранится по имени
-- (equipment_category_settings.category — TEXT PRIMARY KEY).
CREATE TABLE IF NOT EXISTS driver_categories (
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    category TEXT NOT NULL REFERENCES equipment_category_settings(category) ON DELETE CASCADE,
    PRIMARY KEY (user_id, category)
);
CREATE INDEX IF NOT EXISTS idx_driver_categories_category ON driver_categories(category);

-- v2.6: популярность пары (техника, водитель). Инкрементируется при
-- публикации наряда (publish_service.execute_app_publish).
CREATE TABLE IF NOT EXISTS equipment_driver_usage (
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    driver_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
    usage_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (equipment_id, driver_user_id)
);
CREATE INDEX IF NOT EXISTS idx_edu_eq_lastused ON equipment_driver_usage(equipment_id, last_used_at DESC);

-- v2.6: назначение водителей в заявке на конкретную единицу техники.
-- driver_user_id может быть отрицательным (синтетический водитель,
-- созданный прорабом до того, как водитель залогинился через invite_code).
-- Синтетика заменяется на реальный user_id через redeem_synthetic_driver().
CREATE TABLE IF NOT EXISTS application_drivers (
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    driver_user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (application_id, equipment_id)
);
CREATE INDEX IF NOT EXISTS idx_app_drivers_driver ON application_drivers(driver_user_id);

-- v2.6: маркер применённых миграций (см. database/migrations/__init__.py)
CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Таблица заявок
CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    foreman_id INTEGER,
    foreman_name TEXT,
    object_address TEXT,
    object_id INTEGER,
    team_id INTEGER,
    equip_id INTEGER,
    equipment_id INTEGER,
    date_target TEXT,
    time_start INTEGER,
    time_end INTEGER,
    comment TEXT,
    status TEXT DEFAULT 'pending',
    rejection_reason TEXT,
    selected_members TEXT,
    equipment_data TEXT,
    is_team_freed INTEGER DEFAULT 0,
    freed_team_ids TEXT DEFAULT '',
    is_published INTEGER DEFAULT 0,
    approved_by TEXT,
    approved_by_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    is_archived INTEGER DEFAULT 0,
    -- Office bookkeeping marker for completed SMR reports.
    smr_accounted_by INTEGER DEFAULT NULL,
    smr_accounted_at TEXT DEFAULT NULL,
    FOREIGN KEY (foreman_id) REFERENCES users (user_id),
    FOREIGN KEY (team_id) REFERENCES teams (id),
    FOREIGN KEY (equipment_id) REFERENCES equipment (id)
);

-- Связь заявок с конкретными людьми (если есть)
CREATE TABLE IF NOT EXISTS application_selected_staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER,
    member_id INTEGER,
    FOREIGN KEY (app_id) REFERENCES applications(id),
    FOREIGN KEY (member_id) REFERENCES team_members(id)
);

-- ЛОГИ
CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id INTEGER,
    fio TEXT,
    action TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS web_codes (code TEXT, max_id INTEGER, expires REAL);
CREATE TABLE IF NOT EXISTS account_links (primary_id INTEGER, secondary_id INTEGER UNIQUE);
CREATE TABLE IF NOT EXISTS link_codes (code TEXT UNIQUE, user_id INTEGER, expires REAL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

-- ==========================================
-- НОВЫЕ ТАБЛИЦЫ: ЭТАП 1 (ОБЪЕКТЫ И КП)
-- ==========================================

-- Таблица Объектов
CREATE TABLE IF NOT EXISTS objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    default_team_ids TEXT DEFAULT '',
    default_equip_ids TEXT DEFAULT '',
    pdf_file_path TEXT DEFAULT '',
    is_archived INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Запросы на создание объектов (от прорабов)
CREATE TABLE IF NOT EXISTS object_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    comment TEXT DEFAULT '',
    requested_by INTEGER,
    requested_by_name TEXT,
    status TEXT DEFAULT 'pending',
    reviewed_by INTEGER,
    reviewed_by_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    FOREIGN KEY (requested_by) REFERENCES users(user_id)
);

-- Справочник дополнительных работ
CREATE TABLE IF NOT EXISTS extra_works_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unit TEXT DEFAULT 'шт',
    salary REAL DEFAULT 0,
    price REAL DEFAULT 0
);

-- Доп. работы внутри заявки
CREATE TABLE IF NOT EXISTS application_extra_works (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER,
    extra_work_id INTEGER,
    kp_id INTEGER,
    custom_name TEXT DEFAULT '',
    unit TEXT DEFAULT '',
    volume REAL DEFAULT 0,
    salary REAL DEFAULT 0,
    price REAL DEFAULT 0,
    is_additional INTEGER DEFAULT 0,
    FOREIGN KEY (application_id) REFERENCES applications(id),
    FOREIGN KEY (extra_work_id) REFERENCES extra_works_catalog(id),
    FOREIGN KEY (kp_id) REFERENCES kp_catalog(id)
);

-- Глобальный справочник КП (Прайс-лист)
CREATE TABLE IF NOT EXISTS kp_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT,
    name TEXT,
    unit TEXT,
    coefficient REAL,
    salary REAL,
    price REAL,
    old_salary REAL
);

-- План КП по конкретному объекту
CREATE TABLE IF NOT EXISTS object_kp_plan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    object_id INTEGER,
    kp_id INTEGER,
    unit TEXT DEFAULT '',
    FOREIGN KEY (object_id) REFERENCES objects(id),
    FOREIGN KEY (kp_id) REFERENCES kp_catalog(id)
);

-- Файлы объектов (PDF)
CREATE TABLE IF NOT EXISTS object_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    object_id INTEGER,
    file_path TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (object_id) REFERENCES objects(id)
);

-- Выполненные КП внутри заявки (наряда)
CREATE TABLE IF NOT EXISTS application_kp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER,
    kp_id INTEGER,
    volume REAL DEFAULT 0,
    unit TEXT DEFAULT '',
    current_salary REAL,
    current_price REAL,
    status TEXT DEFAULT 'pending',
    is_additional INTEGER DEFAULT 0,
    FOREIGN KEY (application_id) REFERENCES applications(id),
    FOREIGN KEY (kp_id) REFERENCES kp_catalog(id)
);

-- Часы по участникам бригад внутри заявки (СМР wizard: step 1)
CREATE TABLE IF NOT EXISTS application_hours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    hours REAL DEFAULT 0,
    filled_by_user_id INTEGER,
    filled_at TEXT,
    is_additional INTEGER DEFAULT 0,
    FOREIGN KEY (app_id) REFERENCES applications(id),
    FOREIGN KEY (team_id) REFERENCES teams(id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);
CREATE INDEX IF NOT EXISTS idx_app_hours_app ON application_hours(app_id);
-- v2.10: PARTIAL unique index — main rows (is_additional=0) stay unique per
-- (app,team,user); addendum rows (is_additional=1) may duplicate so доп.отчёт
-- can add extra hours for an existing member.
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_hours_unique ON application_hours(app_id, team_id, user_id) WHERE is_additional = 0;

-- Immutable financial history for SMR reports. The complete before/after
-- snapshots make an audit entry independent from later catalog edits.
CREATE TABLE IF NOT EXISTS smr_financial_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    primary_application_id INTEGER NOT NULL,
    application_ids_json TEXT NOT NULL DEFAULT '[]',
    event_type TEXT NOT NULL,
    actor_user_id INTEGER,
    actor_role TEXT DEFAULT '',
    actor_name TEXT DEFAULT '',
    source TEXT DEFAULT '',
    reason TEXT DEFAULT '',
    before_snapshot_json TEXT NOT NULL DEFAULT '{}',
    after_snapshot_json TEXT NOT NULL DEFAULT '{}',
    diff_json TEXT NOT NULL DEFAULT '[]',
    before_hash TEXT DEFAULT '',
    after_hash TEXT DEFAULT '',
    kp_catalog_version_id INTEGER,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id),
    FOREIGN KEY (primary_application_id) REFERENCES applications(id),
    FOREIGN KEY (actor_user_id) REFERENCES users(user_id),
    FOREIGN KEY (kp_catalog_version_id) REFERENCES kp_catalog_versions(id)
);
CREATE INDEX IF NOT EXISTS idx_smr_fin_audit_app_created
    ON smr_financial_audit(primary_application_id, created_at DESC, id DESC);

-- Every successful price-list import creates one immutable version and a
-- normalized copy of all its rows. KP ids are retained for traceability.
CREATE TABLE IF NOT EXISTS kp_catalog_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_number INTEGER NOT NULL UNIQUE,
    source_file TEXT DEFAULT '',
    source_hash TEXT DEFAULT '',
    catalog_hash TEXT NOT NULL,
    imported_by_user_id INTEGER,
    imported_by_name TEXT DEFAULT '',
    row_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activated_at TEXT,
    FOREIGN KEY (imported_by_user_id) REFERENCES users(user_id)
);
CREATE INDEX IF NOT EXISTS idx_kp_catalog_versions_created
    ON kp_catalog_versions(created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS kp_catalog_version_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id INTEGER NOT NULL,
    kp_id INTEGER,
    category TEXT DEFAULT '',
    name TEXT NOT NULL,
    unit TEXT DEFAULT '',
    coefficient REAL DEFAULT 0,
    salary REAL DEFAULT 0,
    price REAL DEFAULT 0,
    old_salary REAL DEFAULT 0,
    FOREIGN KEY (version_id) REFERENCES kp_catalog_versions(id)
);
CREATE INDEX IF NOT EXISTS idx_kp_catalog_version_items_version
    ON kp_catalog_version_items(version_id, category, name, id);

-- Audit/version rows are append-only even when application data is edited.
CREATE TRIGGER IF NOT EXISTS trg_smr_financial_audit_no_update
BEFORE UPDATE ON smr_financial_audit
BEGIN
    SELECT RAISE(ABORT, 'smr_financial_audit is append-only');
END;
CREATE TRIGGER IF NOT EXISTS trg_smr_financial_audit_no_delete
BEFORE DELETE ON smr_financial_audit
BEGIN
    SELECT RAISE(ABORT, 'smr_financial_audit is append-only');
END;
CREATE TRIGGER IF NOT EXISTS trg_kp_catalog_versions_no_update
BEFORE UPDATE ON kp_catalog_versions
BEGIN
    SELECT RAISE(ABORT, 'kp_catalog_versions is append-only');
END;
CREATE TRIGGER IF NOT EXISTS trg_kp_catalog_versions_no_delete
BEFORE DELETE ON kp_catalog_versions
BEGIN
    SELECT RAISE(ABORT, 'kp_catalog_versions is append-only');
END;
CREATE TRIGGER IF NOT EXISTS trg_kp_catalog_version_items_no_update
BEFORE UPDATE ON kp_catalog_version_items
BEGIN
    SELECT RAISE(ABORT, 'kp_catalog_version_items is append-only');
END;
CREATE TRIGGER IF NOT EXISTS trg_kp_catalog_version_items_no_delete
BEFORE DELETE ON kp_catalog_version_items
BEGIN
    SELECT RAISE(ABORT, 'kp_catalog_version_items is append-only');
END;

-- Биржа ресурсов (Stage 5A): обмен техникой между прорабами
CREATE TABLE IF NOT EXISTS equipment_exchanges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL,
    requester_app_id INTEGER NOT NULL,
    donor_id INTEGER NOT NULL,
    donor_app_id INTEGER NOT NULL,
    requested_equip_id INTEGER NOT NULL,
    offered_equip_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    FOREIGN KEY (requester_id) REFERENCES users(user_id),
    FOREIGN KEY (donor_id) REFERENCES users(user_id),
    FOREIGN KEY (requester_app_id) REFERENCES applications(id),
    FOREIGN KEY (donor_app_id) REFERENCES applications(id),
    FOREIGN KEY (requested_equip_id) REFERENCES equipment(id),
    FOREIGN KEY (offered_equip_id) REFERENCES equipment(id)
);

-- Дополнительные работы. `kp_id` is the authoritative source when the row
-- was selected from the main KP catalog; `extra_work_id` is retained only
-- for the legacy extra-work catalog. Prices remain snapshots on this row.
CREATE INDEX IF NOT EXISTS idx_application_kp_app ON application_kp(application_id);
