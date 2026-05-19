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
    invite_code TEXT,                -- v2.6: personal driver/foreman invite code
    default_equipment_id INTEGER,    -- v2.6: drivers' default equipment unit
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
-- DEPRECATED (v2.6, 2026-05-18): driver_fio, tg_id, invite_code remain
-- for backward-compat reads only. Drivers are now independent users with
-- role='driver' and their own users.invite_code. Per-application driver
-- assignment lives in application_drivers. Legacy redemption flow at
-- /api/equipment/invite/join now bridges into the new model.
-- See database/migrations/m_2026_05_drivers_refactor.py
CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    category TEXT,
    driver_fio TEXT DEFAULT 'Не указан',  -- DEPRECATED v2.6
    status TEXT DEFAULT 'free',
    tg_id INTEGER NULL,                   -- DEPRECATED v2.6
    photo_url TEXT,
    invite_code TEXT,                     -- DEPRECATED v2.6
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
    custom_name TEXT DEFAULT '',
    volume REAL DEFAULT 0,
    salary REAL DEFAULT 0,
    price REAL DEFAULT 0,
    FOREIGN KEY (application_id) REFERENCES applications(id),
    FOREIGN KEY (extra_work_id) REFERENCES extra_works_catalog(id)
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
    FOREIGN KEY (app_id) REFERENCES applications(id),
    FOREIGN KEY (team_id) REFERENCES teams(id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);
CREATE INDEX IF NOT EXISTS idx_app_hours_app ON application_hours(app_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_hours_unique ON application_hours(app_id, team_id, user_id);

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