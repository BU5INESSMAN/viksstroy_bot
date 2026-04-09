-- Таблица пользователей системы
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    fio TEXT,
    role TEXT,
    is_active INTEGER DEFAULT 0,
    is_blacklisted INTEGER DEFAULT 0,
    failed_attempts INTEGER DEFAULT 0,
    notify_tg INTEGER DEFAULT 1,
    notify_max INTEGER DEFAULT 1,
    avatar_url TEXT
);

-- Таблица бригад
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    creator_id INTEGER,
    invite_code TEXT,
    join_password TEXT,
    FOREIGN KEY (creator_id) REFERENCES users (user_id)
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
CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    category TEXT,
    driver_fio TEXT DEFAULT 'Не указан',
    status TEXT DEFAULT 'free',
    tg_id INTEGER NULL,
    photo_url TEXT,
    invite_code TEXT,
    is_active INTEGER DEFAULT 1
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
    is_archived INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    current_salary REAL,
    current_price REAL,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY (application_id) REFERENCES applications(id),
    FOREIGN KEY (kp_id) REFERENCES kp_catalog(id)
);