-- Таблица пользователей системы
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    fio TEXT,
    role TEXT,
    is_active INTEGER DEFAULT 0,
    is_blacklisted INTEGER DEFAULT 0,
    failed_attempts INTEGER DEFAULT 0
);

-- Таблица бригад
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    creator_id INTEGER,
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
    is_leader INTEGER DEFAULT 0,
    FOREIGN KEY (team_id) REFERENCES teams (id)
);

-- Справочник техники
CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    category TEXT,
    driver_fio TEXT
);

-- Таблица заявок
CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    foreman_id INTEGER,
    object_address TEXT,
    team_id INTEGER,
    equipment_id INTEGER,
    date_target TEXT,
    time_start INTEGER,
    time_end INTEGER,
    comment TEXT,
    status TEXT DEFAULT 'pending',
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (foreman_id) REFERENCES users (user_id),
    FOREIGN KEY (team_id) REFERENCES teams (id),
    FOREIGN KEY (equipment_id) REFERENCES equipment (id)
);

-- Связь заявок с конкретными людьми на смену (Многие-ко-многим)
CREATE TABLE IF NOT EXISTS application_selected_staff (
    app_id INTEGER,
    member_id INTEGER,
    PRIMARY KEY (app_id, member_id),
    FOREIGN KEY (app_id) REFERENCES applications (id),
    FOREIGN KEY (member_id) REFERENCES team_members (id)
);