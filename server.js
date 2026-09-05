const express = require('express');
let sqlite3 = null;
try {
    sqlite3 = require('sqlite3').verbose();
} catch (e) {
    console.warn('sqlite3 native binary not available. Using built-in resilient database engine.');
}
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

const app = express();
const PORT = 3000;

// Ensure uploads directory exists (use /tmp on Vercel serverless)
const uploadsDir = process.env.VERCEL 
    ? path.join('/tmp', 'uploads')
    : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
    try {
        fs.mkdirSync(uploadsDir, { recursive: true });
    } catch (err) {
        console.error('Error creating uploads directory:', err);
    }
}

// Multer Storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `${cleanBase}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 30 * 1024 * 1024 } // 30MB max
});

// Middleware
app.use(helmet({
    contentSecurityPolicy: false // Disabled for inline scripts/styles in development
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static uploads
app.use('/uploads', express.static(uploadsDir));
// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 60, // Limit each IP
    message: { error: 'Too many requests from this IP, please try again later.' }
});

// Navigation Route Aliases
const PAGE_ROUTES = {
    '/': 'home.html', '/index.html': 'home.html', '/home': 'home.html', '/kanban': 'home.html',
    '/boards': 'boards.html', '/my-boards': 'boards.html',
    '/board': 'board.html', '/canvas': 'board.html',
    '/calendar': 'calendar.html',
    '/login': 'login.html',
    '/signup': 'signup.html'
};
for (const [route, file] of Object.entries(PAGE_ROUTES)) {
    app.get(route, (req, res) => res.sendFile(path.join(__dirname, 'public', file)));
}

// Expose public environment config for serverless deployments (e.g. Vercel)
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL || '',
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
    });
});

// Embedded SQL Schema to guarantee initialization on serverless environments without depending on disk files
const SQL_SCHEMA = `
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
    priority VARCHAR(50),
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
    type VARCHAR(50) NOT NULL,
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
    style VARCHAR(50) DEFAULT 'dotted',
    label TEXT,
    color VARCHAR(50) DEFAULT '#8e7164',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY(from_id) REFERENCES board_elements(id) ON DELETE CASCADE,
    FOREIGN KEY(to_id) REFERENCES board_elements(id) ON DELETE CASCADE
);
`;

class ServerlessDB {
    constructor(storagePath) {
        this.storagePath = storagePath;
        this.data = {
            users: [],
            tasks: [],
            boards: [],
            board_elements: [],
            board_connections: []
        };
        this.counters = {
            users: 0,
            tasks: 0,
            boards: 0,
            board_elements: 0,
            board_connections: 0
        };
        this.loaded = false;
        this.loadPromise = this.load();
    }

    async load() {
        if (!this.storagePath) {
            this.loaded = true;
            return;
        }

        try {
            const raw = await fs.promises.readFile(this.storagePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed.data) this.data = parsed.data;
            if (parsed.counters) this.counters = parsed.counters;
        } catch (err) {
            // Ignore ENOENT (file not found) as it just means an empty DB
            if (err.code !== 'ENOENT') {
                console.error('Error reading fallback storage:', err);
            }
        } finally {
            this.loaded = true;
        }
    }

    save() {
        try {
            if (this.storagePath) {
                fs.writeFileSync(this.storagePath, JSON.stringify({ data: this.data, counters: this.counters }), 'utf8');
            }
        } catch (e) {
            // Ignore write errors in read-only environment
        }
    }

    serialize(fn) {
        if (!this.loaded) {
            this.loadPromise.then(() => this.serialize(fn));
            return;
        }
        if (fn) fn();
    }

    exec(sql, cb) {
        if (!this.loaded) {
            this.loadPromise.then(() => this.exec(sql, cb));
            return;
        }
        if (cb) cb(null);
    }

    run(sql, params, cb) {
        if (typeof params === 'function') {
            cb = params;
            params = [];
        }
        params = params || [];

        if (!this.loaded) {
            this.loadPromise.then(() => this.run(sql, params, cb));
            return;
        }
        const context = { lastID: 0, changes: 0 };

        try {
            const trimmed = (sql || '').trim();
            const upper = trimmed.toUpperCase();

            if (upper.startsWith('PRAGMA')) {
                if (cb) cb.call(context, null);
                return;
            }

            // INSERT INTO users
            if (upper.startsWith('INSERT INTO USERS')) {
                const [full_name, email, password_hash] = params;
                const existing = this.data.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase());
                if (existing) {
                    const err = new Error('UNIQUE constraint failed: users.email');
                    if (cb) return cb.call(context, err);
                    return;
                }
                const id = ++this.counters.users;
                const user = { id, full_name, email: (email || '').toLowerCase(), password_hash, created_at: new Date().toISOString() };
                this.data.users.push(user);
                this.save();
                context.lastID = id;
                context.changes = 1;
                if (cb) cb.call(context, null);
                return;
            }

            // INSERT INTO tasks
            if (upper.startsWith('INSERT INTO TASKS')) {
                const [user_id, title, description, status, priority, category, due_date] = params;
                const id = ++this.counters.tasks;
                const task = {
                    id,
                    user_id: user_id ? String(user_id) : user_id,
                    title,
                    description: description || '',
                    status: status || 'todo',
                    priority: priority || '',
                    category: category || 'Work',
                    due_date: due_date || null,
                    created_at: new Date().toISOString()
                };
                this.data.tasks.push(task);
                this.save();
                context.lastID = id;
                context.changes = 1;
                if (cb) cb.call(context, null);
                return;
            }

            // UPDATE tasks
            if (upper.startsWith('UPDATE TASKS')) {
                const [title, description, status, priority, due_date, id, user_id] = params;
                const task = this.data.tasks.find(t => t.id === Number(id) && String(t.user_id) === String(user_id));
                if (task) {
                    if (title !== undefined && title !== null) task.title = title;
                    if (description !== undefined && description !== null) task.description = description;
                    if (status !== undefined && status !== null) task.status = status;
                    if (priority !== undefined && priority !== null) task.priority = priority;
                    if (due_date !== undefined && due_date !== null) task.due_date = due_date;
                    this.save();
                    context.changes = 1;
                }
                if (cb) cb.call(context, null);
                return;
            }

            // DELETE FROM tasks
            if (upper.startsWith('DELETE FROM TASKS')) {
                const [id, user_id] = params;
                const initialLen = this.data.tasks.length;
                this.data.tasks = this.data.tasks.filter(t => !(t.id === Number(id) && String(t.user_id) === String(user_id)));
                context.changes = initialLen - this.data.tasks.length;
                this.save();
                if (cb) cb.call(context, null);
                return;
            }

            // INSERT INTO boards
            if (upper.startsWith('INSERT INTO BOARDS')) {
                const [user_id, title, description, icon, color] = params;
                const id = ++this.counters.boards;
                const board = {
                    id,
                    user_id: user_id ? String(user_id) : user_id,
                    title,
                    description: description || '',
                    icon: icon || 'dashboard',
                    color: color || '#a04100',
                    created_at: new Date().toISOString()
                };
                this.data.boards.push(board);
                this.save();
                context.lastID = id;
                context.changes = 1;
                if (cb) cb.call(context, null);
                return;
            }

            // UPDATE boards
            if (upper.startsWith('UPDATE BOARDS')) {
                const [title, description, icon, color, id, user_id] = params;
                const board = this.data.boards.find(b => b.id === Number(id) && String(b.user_id) === String(user_id));
                if (board) {
                    if (title !== undefined && title !== null) board.title = title;
                    if (description !== undefined && description !== null) board.description = description;
                    if (icon !== undefined && icon !== null) board.icon = icon;
                    if (color !== undefined && color !== null) board.color = color;
                    this.save();
                    context.changes = 1;
                }
                if (cb) cb.call(context, null);
                return;
            }

            // DELETE FROM boards
            if (upper.startsWith('DELETE FROM BOARDS')) {
                const [id] = params;
                const initialLen = this.data.boards.length;
                this.data.boards = this.data.boards.filter(b => b.id !== Number(id));
                this.data.board_elements = this.data.board_elements.filter(e => e.board_id !== Number(id));
                this.data.board_connections = this.data.board_connections.filter(c => c.board_id !== Number(id));
                context.changes = initialLen - this.data.boards.length;
                this.save();
                if (cb) cb.call(context, null);
                return;
            }

            // INSERT INTO board_elements
            if (upper.startsWith('INSERT INTO BOARD_ELEMENTS')) {
                const [board_id, type, x, y, width, height, content, file_url, file_name, file_size, file_type, color, z_index] = params;
                const id = ++this.counters.board_elements;
                const el = {
                    id,
                    board_id: Number(board_id),
                    type,
                    x: x !== undefined ? x : 100,
                    y: y !== undefined ? y : 100,
                    width: width !== undefined ? width : 260,
                    height: height !== undefined ? height : 180,
                    content: content || '',
                    file_url: file_url || null,
                    file_name: file_name || null,
                    file_size: file_size || null,
                    file_type: file_type || null,
                    color: color || '#ffffff',
                    z_index: z_index !== undefined ? z_index : 1,
                    created_at: new Date().toISOString()
                };
                this.data.board_elements.push(el);
                this.save();
                context.lastID = id;
                context.changes = 1;
                if (cb) cb.call(context, null);
                return;
            }

            // UPDATE board_elements
            if (upper.startsWith('UPDATE BOARD_ELEMENTS')) {
                const [x, y, width, height, content, color, z_index, id, board_id] = params;
                const el = this.data.board_elements.find(e => e.id === Number(id) && e.board_id === Number(board_id));
                if (el) {
                    if (x !== undefined && x !== null) el.x = x;
                    if (y !== undefined && y !== null) el.y = y;
                    if (width !== undefined && width !== null) el.width = width;
                    if (height !== undefined && height !== null) el.height = height;
                    if (content !== undefined && content !== null) el.content = content;
                    if (color !== undefined && color !== null) el.color = color;
                    if (z_index !== undefined && z_index !== null) el.z_index = z_index;
                    this.save();
                    context.changes = 1;
                }
                if (cb) cb.call(context, null);
                return;
            }

            // DELETE FROM board_elements
            if (upper.startsWith('DELETE FROM BOARD_ELEMENTS')) {
                if (upper.includes('WHERE BOARD_ID = ?')) {
                    const [board_id] = params;
                    this.data.board_elements = this.data.board_elements.filter(e => e.board_id !== Number(board_id));
                } else if (upper.includes('WHERE ID = ? AND BOARD_ID = ?')) {
                    const [id, board_id] = params;
                    const initialLen = this.data.board_elements.length;
                    this.data.board_elements = this.data.board_elements.filter(e => !(e.id === Number(id) && e.board_id === Number(board_id)));
                    context.changes = initialLen - this.data.board_elements.length;
                }
                this.save();
                if (cb) cb.call(context, null);
                return;
            }

            // INSERT INTO board_connections
            if (upper.startsWith('INSERT INTO BOARD_CONNECTIONS')) {
                const [board_id, from_id, to_id, style, label, color] = params;
                const id = ++this.counters.board_connections;
                const conn = {
                    id,
                    board_id: Number(board_id),
                    from_id: Number(from_id),
                    to_id: Number(to_id),
                    style: style || 'dotted',
                    label: label || '',
                    color: color || '#8e7164',
                    created_at: new Date().toISOString()
                };
                this.data.board_connections.push(conn);
                this.save();
                context.lastID = id;
                context.changes = 1;
                if (cb) cb.call(context, null);
                return;
            }

            // DELETE FROM board_connections
            if (upper.startsWith('DELETE FROM BOARD_CONNECTIONS')) {
                if (upper.includes('WHERE BOARD_ID = ?')) {
                    const [board_id] = params;
                    this.data.board_connections = this.data.board_connections.filter(c => c.board_id !== Number(board_id));
                } else if (upper.includes('WHERE FROM_ID = ? OR TO_ID = ?')) {
                    const [from_id, to_id] = params;
                    this.data.board_connections = this.data.board_connections.filter(c => c.from_id !== Number(from_id) && c.to_id !== Number(to_id));
                } else if (upper.includes('WHERE ID = ? AND BOARD_ID = ?')) {
                    const [id, board_id] = params;
                    const initialLen = this.data.board_connections.length;
                    this.data.board_connections = this.data.board_connections.filter(c => !(c.id === Number(id) && c.board_id === Number(board_id)));
                    context.changes = initialLen - this.data.board_connections.length;
                }
                this.save();
                if (cb) cb.call(context, null);
                return;
            }

            if (cb) cb.call(context, null);
        } catch (err) {
            console.error('ServerlessDB run error:', err);
            if (cb) cb.call(context, err);
        }
    }

    get(sql, params, cb) {
        if (typeof params === 'function') {
            cb = params;
            params = [];
        }
        params = params || [];

        if (!this.loaded) {
            this.loadPromise.then(() => this.get(sql, params, cb));
            return;
        }

        try {
            const upper = (sql || '').trim().toUpperCase();

            // SELECT * FROM users WHERE email = ?
            if (upper.includes('FROM USERS WHERE EMAIL = ?')) {
                const [email] = params;
                const user = this.data.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase()) || null;
                if (cb) cb(null, user);
                return;
            }

            // SELECT * FROM boards WHERE id = ? AND user_id = ?
            if (upper.includes('FROM BOARDS WHERE ID = ? AND USER_ID = ?')) {
                const [id, user_id] = params;
                const board = this.data.boards.find(b => b.id === Number(id) && String(b.user_id) === String(user_id)) || null;
                if (cb) cb(null, board);
                return;
            }

            if (cb) cb(null, null);
        } catch (err) {
            console.error('ServerlessDB get error:', err);
            if (cb) cb(err, null);
        }
    }

    all(sql, params, cb) {
        if (typeof params === 'function') {
            cb = params;
            params = [];
        }
        params = params || [];

        if (!this.loaded) {
            this.loadPromise.then(() => this.all(sql, params, cb));
            return;
        }

        try {
            const upper = (sql || '').trim().toUpperCase();

            // SELECT * FROM tasks WHERE user_id = ? ORDER BY id ASC
            if (upper.includes('FROM TASKS WHERE USER_ID = ?')) {
                const [user_id] = params;
                const rows = this.data.tasks
                    .filter(t => String(t.user_id) === String(user_id))
                    .sort((a, b) => a.id - b.id);
                if (cb) cb(null, rows);
                return;
            }

            // SELECT b.*, ... FROM boards b WHERE b.user_id = ?
            if (upper.includes('FROM BOARDS') && upper.includes('USER_ID = ?')) {
                const [user_id] = params;
                const rows = this.data.boards
                    .filter(b => String(b.user_id) === String(user_id))
                    .map(b => ({
                        ...b,
                        element_count: this.data.board_elements.filter(e => e.board_id === b.id).length,
                        connection_count: this.data.board_connections.filter(c => c.board_id === b.id).length
                    }))
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                if (cb) cb(null, rows);
                return;
            }

            // SELECT * FROM board_elements WHERE board_id = ? ORDER BY z_index ASC, id ASC
            if (upper.includes('FROM BOARD_ELEMENTS WHERE BOARD_ID = ?')) {
                const [board_id] = params;
                const rows = this.data.board_elements
                    .filter(e => e.board_id === Number(board_id))
                    .sort((a, b) => (a.z_index - b.z_index) || (a.id - b.id));
                if (cb) cb(null, rows);
                return;
            }

            // SELECT * FROM board_connections WHERE board_id = ? ORDER BY id ASC
            if (upper.includes('FROM BOARD_CONNECTIONS WHERE BOARD_ID = ?')) {
                const [board_id] = params;
                const rows = this.data.board_connections
                    .filter(c => c.board_id === Number(board_id))
                    .sort((a, b) => a.id - b.id);
                if (cb) cb(null, rows);
                return;
            }

            if (cb) cb(null, []);
        } catch (err) {
            console.error('ServerlessDB all error:', err);
            if (cb) cb(err, []);
        }
    }
}

// Safe database instantiation: Use sqlite3 if available; otherwise use ServerlessDB
let db;
const storagePath = process.env.VERCEL
    ? path.join('/tmp', 'database.sqlite')
    : path.join(__dirname, 'database.sqlite');

if (sqlite3 && !process.env.VERCEL) {
    try {
        db = new sqlite3.Database(storagePath, (err) => {
            if (err) {
                console.error('Error opening sqlite3 database, switching to ServerlessDB fallback:', err);
                db = new ServerlessDB(path.join(__dirname, 'database.json'));
            } else {
                db.serialize(() => {
                    db.run('PRAGMA foreign_keys = OFF;');
                    db.exec(SQL_SCHEMA, (schemaErr) => {
                        if (schemaErr) console.error('Error executing schema:', schemaErr);
                    });
                    db.run('ALTER TABLE tasks ADD COLUMN priority VARCHAR(50);', () => {});
                    syncUsersFile();
                });
            }
        });
    } catch (e) {
        db = new ServerlessDB(path.join(__dirname, 'database.json'));
        syncUsersFile();
    }
} else {
    // Vercel serverless environment: Zero-crash resilient serverless storage
    const fallbackPath = process.env.VERCEL ? path.join('/tmp', 'database.json') : path.join(__dirname, 'database.json');
    db = new ServerlessDB(fallbackPath);
    syncUsersFile();
    console.log('Running on resilient ServerlessDB engine for cloud deployment.');
}

// ----------------------------------------------------
// AUTHENTICATION APIs
// ----------------------------------------------------
function formatUsersTxt(rows) {
    const header = [
        '================================================================================',
        'FLOWBOARD - REGISTERED USERS DATA',
        `Export Date: ${new Date().toISOString().split('T')[0]}`,
        `Total Users: ${rows.length}`,
        '================================================================================\n'
    ].join('\n');

    const body = rows.map(u => [
        `[User ID: ${u.id}]`,
        `Full Name     : ${u.full_name}`,
        `Email         : ${u.email}`,
        `Registered At : ${u.created_at || 'N/A'}\n`,
        '--------------------------------------------------------------------------------'
    ].join('\n')).join('\n');

    return `${header}${body}\n================================================================================\n`;
}

function syncUsersFile() {
    if (!db || typeof db.all !== 'function') return;
    db.all('SELECT id, full_name, email, created_at FROM users ORDER BY id ASC', (err, rows) => {
        if (err || !rows) return;
        const filePath = process.env.VERCEL ? path.join('/tmp', 'users.txt') : path.join(__dirname, 'users.txt');
        fs.writeFile(filePath, formatUsersTxt(rows), () => {});
    });
}

// Live export route: returns users.txt as a downloadable text file
app.get('/api/users/export', (req, res) => {
    db.all('SELECT id, full_name, email, created_at FROM users ORDER BY id ASC', (err, rows) => {
        if (err) return res.status(500).send('Database error.');
        const content = formatUsersTxt(rows || []);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="users.txt"');
        res.send(content);
    });
});

// Auto-sync endpoint for recording external/Supabase/OAuth signins & signups
app.post('/api/sync-user', (req, res) => {
    const { name, email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name || cleanEmail.split('@')[0]).trim();

    db.get('SELECT * FROM users WHERE email = ?', [cleanEmail], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (user) {
            syncUsersFile();
            return res.json({ message: 'User already recorded.', user: { id: user.id, name: user.full_name, email: user.email } });
        }
        db.run('INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)', [cleanName, cleanEmail, 'oauth_synced'], function (insertErr) {
            if (insertErr) return res.status(500).json({ error: 'Failed to record user.' });
            syncUsersFile();
            res.status(201).json({ message: 'User recorded successfully!', user: { id: this ? this.lastID : null, name: cleanName, email: cleanEmail } });
        });
    });
});

app.post('/api/signup', authLimiter, async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run('INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)', [cleanName, cleanEmail, hashedPassword], function (err) {
            if (err) {
                if (err.message && err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Email already exists.' });
                }
                return res.status(500).json({ error: 'Database error.' });
            }
            syncUsersFile();
            res.status(201).json({ message: 'User registered successfully!', userId: this.lastID });
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

app.post('/api/login', authLimiter, (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    db.get('SELECT * FROM users WHERE email = ?', [cleanEmail], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Database error.' });
        }

        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }

        res.json({ message: 'Login successful!', user: { id: user.id, name: user.full_name, email: user.email } });
    });
});

// ----------------------------------------------------
// TASKS & CALENDAR APIs (Kanban / Calendar)
// ----------------------------------------------------
app.get('/api/tasks', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    db.all('SELECT * FROM tasks WHERE user_id = ? ORDER BY id ASC', [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        res.json(rows);
    });
});

app.post('/api/tasks', (req, res) => {
    const userId = req.body.userId || req.headers['user-id'] || 1;
    const { title, description, status, due_date, priority, category } = req.body;

    if (!title) {
        return res.status(400).json({ error: 'Title is required' });
    }

    db.run(
        'INSERT INTO tasks (user_id, title, description, status, priority, category, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, title, description, status || 'todo', priority || '', category || 'Work', due_date],
        function (err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error.' });
            }
            res.status(201).json({ id: this.lastID, user_id: userId, title, description, status: status || 'todo', priority: priority || '', category: category || 'Work', due_date });
        }
    );
});

app.put('/api/tasks/:id', (req, res) => {
    const taskId = req.params.id;
    const { title, description, status, category, due_date, userId } = req.body;
    if (!userId) return res.status(403).json({ error: 'Unauthorized: userId required.' });
    db.run(
        'UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status), category = COALESCE(?, category), due_date = COALESCE(?, due_date) WHERE id = ? AND user_id = ?',
        [title, description, status, category, due_date, taskId, userId],
        function (err) {
            if (err) return res.status(500).json({ error: 'Database error.' });
            if (this.changes === 0) return res.status(404).json({ error: 'Task not found or unauthorized.' });
            res.json({ success: true });
        }
    );
});

app.delete('/api/tasks/:id', (req, res) => {
    const taskId = req.params.id;
    const userId = req.query.userId || (req.body && req.body.userId);
    if (!userId) return res.status(403).json({ error: 'Unauthorized: userId required.' });
    db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [taskId, userId], function (err) {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (this.changes === 0) return res.status(404).json({ error: 'Task not found or unauthorized.' });
        res.json({ success: true });
    });
});

// ----------------------------------------------------
// FILE UPLOAD API (Images, Documents, PDFs)
// ----------------------------------------------------
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
        file_url: fileUrl,
        file_name: req.file.originalname,
        file_type: req.file.mimetype,
        file_size: req.file.size
    });
});

// ----------------------------------------------------
// BOARDS MANAGEMENT APIs (My Boards Hub)
// ----------------------------------------------------
app.get('/api/boards', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const sql = `
        SELECT b.*, 
               (SELECT COUNT(*) FROM board_elements WHERE board_id = b.id) AS element_count,
               (SELECT COUNT(*) FROM board_connections WHERE board_id = b.id) AS connection_count
        FROM boards b 
        WHERE b.user_id = ? 
        ORDER BY b.created_at DESC
    `;

    db.all(sql, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        res.json(rows);
    });
});

app.post('/api/boards', (req, res) => {
    const userId = req.headers['user-id'] || 1;
    const { title, description, icon, color } = req.body;

    if (!title) {
        return res.status(400).json({ error: 'Board title is required' });
    }

    db.run(
        'INSERT INTO boards (user_id, title, description, icon, color) VALUES (?, ?, ?, ?, ?)',
        [userId, title, description || '', icon || 'dashboard', color || '#a04100'],
        function (err) {
            if (err) return res.status(500).json({ error: 'Database error.' });
            res.status(201).json({
                id: this.lastID,
                user_id: userId,
                title,
                description: description || '',
                icon: icon || 'dashboard',
                color: color || '#a04100'
            });
        }
    );
});

app.get('/api/boards/:id', (req, res) => {
    const boardId = req.params.id;
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    db.get('SELECT * FROM boards WHERE id = ? AND user_id = ?', [boardId, userId], (err, board) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (!board) return res.status(404).json({ error: 'Board not found.' });

        // Fetch elements
        db.all('SELECT * FROM board_elements WHERE board_id = ? ORDER BY z_index ASC, id ASC', [boardId], (err, elements) => {
            if (err) return res.status(500).json({ error: 'Database error fetching elements.' });

            // Fetch connections
            db.all('SELECT * FROM board_connections WHERE board_id = ? ORDER BY id ASC', [boardId], (err, connections) => {
                if (err) return res.status(500).json({ error: 'Database error fetching connections.' });

                res.json({
                    board,
                    elements: elements || [],
                    connections: connections || []
                });
            });
        });
    });
});

app.put('/api/boards/:id', (req, res) => {
    const boardId = req.params.id;
    const { title, description, icon, color, userId } = req.body;
    if (!userId) return res.status(403).json({ error: 'Unauthorized: userId required.' });

    db.run(
        'UPDATE boards SET title = COALESCE(?, title), description = COALESCE(?, description), icon = COALESCE(?, icon), color = COALESCE(?, color) WHERE id = ? AND user_id = ?',
        [title, description, icon, color, boardId, userId],
        function (err) {
            if (err) return res.status(500).json({ error: 'Database error.' });
            if (this.changes === 0) return res.status(404).json({ error: 'Board not found or unauthorized.' });
            res.json({ success: true });
        }
    );
});

app.delete('/api/boards/:id', (req, res) => {
    const boardId = req.params.id;
    const userId = req.query.userId || (req.body && req.body.userId);
    if (!userId) return res.status(403).json({ error: 'Unauthorized: userId required.' });

    // Verify ownership
    db.get('SELECT * FROM boards WHERE id = ? AND user_id = ?', [boardId, userId], (err, board) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (!board) return res.status(404).json({ error: 'Board not found or unauthorized.' });

        db.serialize(() => {
            db.run('DELETE FROM board_connections WHERE board_id = ?', [boardId]);
            db.run('DELETE FROM board_elements WHERE board_id = ?', [boardId]);
            db.run('DELETE FROM boards WHERE id = ?', [boardId], function (err) {
                if (err) return res.status(500).json({ error: 'Database error.' });
                res.json({ success: true });
            });
        });
    });
});

// ----------------------------------------------------
// CANVAS ELEMENTS APIs
// ----------------------------------------------------
app.post('/api/boards/:id/elements', (req, res) => {
    const boardId = req.params.id;
    const { type, x, y, width, height, content, file_url, file_name, file_size, file_type, color, z_index } = req.body;

    if (!type) return res.status(400).json({ error: 'Element type is required.' });

    db.run(
        `INSERT INTO board_elements 
        (board_id, type, x, y, width, height, content, file_url, file_name, file_size, file_type, color, z_index) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            boardId,
            type,
            x !== undefined ? x : 100,
            y !== undefined ? y : 100,
            width !== undefined ? width : 260,
            height !== undefined ? height : 180,
            content || '',
            file_url || null,
            file_name || null,
            file_size || null,
            file_type || null,
            color || '#ffffff',
            z_index !== undefined ? z_index : 1
        ],
        function (err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error creating element.' });
            }
            res.status(201).json({
                id: this.lastID,
                board_id: Number(boardId),
                type,
                x: x !== undefined ? x : 100,
                y: y !== undefined ? y : 100,
                width: width !== undefined ? width : 260,
                height: height !== undefined ? height : 180,
                content: content || '',
                file_url: file_url || null,
                file_name: file_name || null,
                file_size: file_size || null,
                file_type: file_type || null,
                color: color || '#ffffff',
                z_index: z_index !== undefined ? z_index : 1
            });
        }
    );
});

app.put('/api/boards/:id/elements/:elementId', (req, res) => {
    const boardId = req.params.id;
    const elementId = req.params.elementId;
    const { x, y, width, height, content, color, z_index } = req.body;

    db.run(
        `UPDATE board_elements SET 
            x = COALESCE(?, x), 
            y = COALESCE(?, y), 
            width = COALESCE(?, width), 
            height = COALESCE(?, height), 
            content = COALESCE(?, content), 
            color = COALESCE(?, color), 
            z_index = COALESCE(?, z_index) 
        WHERE id = ? AND board_id = ?`,
        [x, y, width, height, content, color, z_index, elementId, boardId],
        function (err) {
            if (err) return res.status(500).json({ error: 'Database error updating element.' });
            if (this.changes === 0) return res.status(404).json({ error: 'Element not found.' });
            res.json({ success: true });
        }
    );
});

app.delete('/api/boards/:id/elements/:elementId', (req, res) => {
    const boardId = req.params.id;
    const elementId = req.params.elementId;

    db.serialize(() => {
        db.run('DELETE FROM board_connections WHERE from_id = ? OR to_id = ?', [elementId, elementId]);
        db.run('DELETE FROM board_elements WHERE id = ? AND board_id = ?', [elementId, boardId], function (err) {
            if (err) return res.status(500).json({ error: 'Database error deleting element.' });
            if (this.changes === 0) return res.status(404).json({ error: 'Element not found.' });
            res.json({ success: true });
        });
    });
});

// ----------------------------------------------------
// BOARD CONNECTIONS APIs (Dotted / Dashed / Solid Lines)
// ----------------------------------------------------
app.post('/api/boards/:id/connections', (req, res) => {
    const boardId = req.params.id;
    const userId = req.headers['user-id'] || (req.body && req.body.userId) || req.query.userId;
    if (!userId) return res.status(403).json({ error: 'Unauthorized: userId required.' });

    const { from_id, to_id, style, label, color } = req.body;

    if (!from_id || !to_id) {
        return res.status(400).json({ error: 'from_id and to_id are required.' });
    }

    // Verify ownership of the board
    db.get('SELECT * FROM boards WHERE id = ? AND user_id = ?', [boardId, userId], (err, board) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (!board) return res.status(404).json({ error: 'Board not found or unauthorized.' });

        db.run(
            'INSERT INTO board_connections (board_id, from_id, to_id, style, label, color) VALUES (?, ?, ?, ?, ?, ?)',
            [boardId, from_id, to_id, style || 'dotted', label || '', color || '#8e7164'],
            function (err) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Database error creating connection.' });
                }
                res.status(201).json({
                    id: this.lastID,
                    board_id: Number(boardId),
                    from_id: Number(from_id),
                    to_id: Number(to_id),
                    style: style || 'dotted',
                    label: label || '',
                    color: color || '#8e7164'
                });
            }
        );
    });
});

app.delete('/api/boards/:id/connections/:connId', (req, res) => {
    const boardId = req.params.id;
    const connId = req.params.connId;

    db.run('DELETE FROM board_connections WHERE id = ? AND board_id = ?', [connId, boardId], function (err) {
        if (err) return res.status(500).json({ error: 'Database error deleting connection.' });
        if (this.changes === 0) return res.status(404).json({ error: 'Connection not found.' });
        res.json({ success: true });
    });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
