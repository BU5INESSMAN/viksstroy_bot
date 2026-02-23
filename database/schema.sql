-- Таблица пользователей системы
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,          -- Telegram ID
    fio TEXT,                             -- ФИО пользователя
    role TEXT,                            -- admin, moderator, foreman
    is_active INTEGER DEFAULT 0,          -- Прошел ли регистрацию
    is_blacklisted INTEGER DEFAULT 0,     -- Заблокирован ли (3 ошибки)
    failed_attempts INTEGER DEFAULT 0     -- Счетчик неверных паролей
);

-- Таблица бригад
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,                            -- Название (авто или ручное)
    creator_id INTEGER,                   -- Кто создал
    FOREIGN KEY (creator_id) REFERENCES users (user_id)
);

-- Состав бригад
CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    fio TEXT,
    position TEXT,                        -- Должность
    invite_code TEXT UNIQUE,              -- 8-значный код для регистрации
    tg_user_id INTEGER NULL,              -- Заполнится, когда человек зайдет по ссылке
    is_leader INTEGER DEFAULT 0,          -- Является ли бригадиром
    FOREIGN KEY (team_id) REFERENCES teams (id)
);

-- Справочник техники
CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,                            -- Название (например, "Экскаватор JCB")
    category TEXT,                        -- Категория
    driver_fio TEXT                       -- ФИО прикрепленного водителя
);

-- Таблица заявок
CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    foreman_id INTEGER,
    object_address TEXT,
    team_id INTEGER,
    equipment_id INTEGER,
    date_target TEXT,                     -- Формат ДД.ММ
    time_start INTEGER,
    time_end INTEGER,
    comment TEXT,
    status TEXT DEFAULT 'pending',        -- pending, approved, rejected
    rejection_reason TEXT,                -- Причина отказа
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