const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

const app = express();
const PORT = 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
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
// Serve static files from current directory
app.use(express.static(__dirname));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 60, // Limit each IP
    message: { error: 'Too many requests from this IP, please try again later.' }
});

// Navigation Route Aliases
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

app.get('/home', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

app.get('/kanban', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

app.get('/my-boards', (req, res) => {
    res.sendFile(path.join(__dirname, 'boards.html'));
});

app.get('/boards', (req, res) => {
    res.sendFile(path.join(__dirname, 'boards.html'));
});

app.get('/board', (req, res) => {
    res.sendFile(path.join(__dirname, 'board.html'));
});

app.get('/canvas', (req, res) => {
    res.sendFile(path.join(__dirname, 'board.html'));
});

app.get('/calendar', (req, res) => {
    res.sendFile(path.join(__dirname, 'calendar.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

// Initialize Database
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Database connected.');
        db.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
            if (pragmaErr) console.error('Error enabling foreign keys:', pragmaErr);
        });
        const sqlSchema = fs.readFileSync(path.join(__dirname, 'users.sql'), 'utf8');
        db.exec(sqlSchema, (err) => {
            if (err) {
                console.error('Error executing schema:', err);
            } else {
                console.log('Schema initialized.');
            }
        });
    }
});

// ----------------------------------------------------
// AUTHENTICATION APIs
// ----------------------------------------------------
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
    const { userId, title, description, status, category, due_date } = req.body;
    if (!userId || !title) return res.status(400).json({ error: 'userId and title are required.' });
    db.run(
        'INSERT INTO tasks (user_id, title, description, status, category, due_date) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, title, description, status || 'todo', category, due_date],
        function (err) {
            if (err) return res.status(500).json({ error: 'Database error.' });
            res.status(201).json({ id: this.lastID, user_id: userId, title, description, status: status || 'todo', category, due_date });
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
    const { userId, title, description, icon, color } = req.body;
    if (!userId || !title) return res.status(400).json({ error: 'userId and title are required.' });

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
    const { from_id, to_id, style, label, color } = req.body;

    if (!from_id || !to_id) {
        return res.status(400).json({ error: 'from_id and to_id are required.' });
    }

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

app.delete('/api/boards/:id/connections/:connId', (req, res) => {
    const boardId = req.params.id;
    const connId = req.params.connId;

    db.run('DELETE FROM board_connections WHERE id = ? AND board_id = ?', [connId, boardId], function (err) {
        if (err) return res.status(500).json({ error: 'Database error deleting connection.' });
        if (this.changes === 0) return res.status(404).json({ error: 'Connection not found.' });
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
