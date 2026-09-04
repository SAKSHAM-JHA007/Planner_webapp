CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'todo',
    category VARCHAR(50),
    due_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT 'dashboard',
    color VARCHAR(50) DEFAULT '#a04100',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS board_elements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'note', 'image', 'document', 'todo', 'link'
    x REAL DEFAULT 100,
    y REAL DEFAULT 100,
    width REAL DEFAULT 260,
    height REAL DEFAULT 180,
    content TEXT,
    file_url TEXT,
    file_name TEXT,
    file_size INTEGER,
    file_type TEXT,
    color VARCHAR(50) DEFAULT '#ffffff',
    z_index INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS board_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    from_id INTEGER NOT NULL,
    to_id INTEGER NOT NULL,
    style VARCHAR(50) DEFAULT 'dotted', -- 'solid', 'dashed', 'dotted'
    label TEXT,
    color VARCHAR(50) DEFAULT '#8e7164',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY(from_id) REFERENCES board_elements(id) ON DELETE CASCADE,
    FOREIGN KEY(to_id) REFERENCES board_elements(id) ON DELETE CASCADE
);
