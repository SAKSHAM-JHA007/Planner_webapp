const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
// Serve static files from the current directory
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

// Initialize Database
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Database connected.');
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

// Signup Route
app.post('/api/signup', async (req, res) => {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run('INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)', [name, email, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
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

// Login Route
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }
    
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
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

// Tasks API
app.get('/api/tasks', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    db.all('SELECT * FROM tasks WHERE user_id = ?', [userId], (err, rows) => {
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
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error.' });
            res.status(201).json({ id: this.lastID, user_id: userId, title, description, status: status || 'todo', category, due_date });
        }
    );
});

app.put('/api/tasks/:id', (req, res) => {
    const taskId = req.params.id;
    const { title, description, status, category, due_date } = req.body;
    db.run(
        'UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status), category = COALESCE(?, category), due_date = COALESCE(?, due_date) WHERE id = ?',
        [title, description, status, category, due_date, taskId],
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error.' });
            res.json({ success: true });
        }
    );
});

app.delete('/api/tasks/:id', (req, res) => {
    const taskId = req.params.id;
    db.run('DELETE FROM tasks WHERE id = ?', [taskId], function(err) {
        if (err) return res.status(500).json({ error: 'Database error.' });
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
