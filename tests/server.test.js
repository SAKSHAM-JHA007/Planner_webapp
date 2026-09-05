const test = require('node:test');
const assert = require('node:assert');
const app = require('../server');

let server;
let baseUrl;

test.before(async () => {
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
});

test.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
});

test('POST /api/tasks creates task successfully', async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-id': '2' },
        body: JSON.stringify({ title: 'Test Task' })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.title, 'Test Task');
    assert.strictEqual(data.user_id, '2');
});

test('POST /api/tasks validates missing title', async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-id': '2' },
        body: JSON.stringify({ description: 'No title' })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'Title is required');
});

test('POST /api/boards creates board and validates title', async () => {
    const res = await fetch(`${baseUrl}/api/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-id': '2' },
        body: JSON.stringify({ title: 'Test Board' })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.title, 'Test Board');

    const failRes = await fetch(`${baseUrl}/api/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-id': '2' },
        body: JSON.stringify({})
    });
    assert.strictEqual(failRes.status, 400);
});

test('POST /api/boards rejects request without userId', async () => {
    const res = await fetch(`${baseUrl}/api/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Unauthenticated Board' })
    });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, 'Unauthorized: userId required');
});

test('POST /api/tasks rejects request without userId', async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Unauthenticated Task' })
    });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, 'Unauthorized: userId required');
});

test('GET /api/config returns configuration shape', async () => {
    const res = await fetch(`${baseUrl}/api/config`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('supabaseUrl' in data);
    assert.ok('supabaseAnonKey' in data);
});

test('POST /api/tasks supports category and body userId', async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Categorized Task', category: 'Important', userId: 'user-123' })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.title, 'Categorized Task');
    assert.strictEqual(data.category, 'Important');
    assert.strictEqual(data.user_id, 'user-123');
});

test('POST /api/login rejects missing credentials', async () => {
    const res = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: '' })
    });
    assert.strictEqual(res.status, 400);
});

test('POST /api/signup updates users.txt automatically', async () => {
    const uniqueEmail = `autouser_${Date.now()}@example.com`;
    const res = await fetch(`${baseUrl}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Auto Test User', email: uniqueEmail, password: 'password123' })
    });
    assert.strictEqual(res.status, 201);
    await new Promise(r => setTimeout(r, 150));
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'users.txt'), 'utf8');
    assert.ok(content.includes(uniqueEmail), 'users.txt should contain newly registered user email');
});

test('POST /api/sync-user records Supabase/OAuth users and updates users.txt', async () => {
    const oauthEmail = `oauth_user_${Date.now()}@gmail.com`;
    const res = await fetch(`${baseUrl}/api/sync-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'OAuth User', email: oauthEmail })
    });
    assert.strictEqual(res.status, 201);
    await new Promise(r => setTimeout(r, 150));
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'users.txt'), 'utf8');
    assert.ok(content.includes(oauthEmail), 'users.txt should contain synced OAuth user');
});

test('GET /api/users/export serves downloadable users.txt', async () => {
    const res = await fetch(`${baseUrl}/api/users/export`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/plain'));
    const text = await res.text();
    assert.ok(text.includes('FLOWBOARD - REGISTERED USERS DATA'));
});

test('POST /api/boards/:id/elements validates authorization and ownership', async () => {
    // First create a board for user '10'
    const createBoardRes = await fetch(`${baseUrl}/api/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-id': '10' },
        body: JSON.stringify({ title: 'User 10 Board' })
    });
    assert.strictEqual(createBoardRes.status, 201);
    const board = await createBoardRes.json();
    const boardId = board.id;

    // 1. Missing userId should return 403
    const noAuthRes = await fetch(`${baseUrl}/api/boards/${boardId}/elements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'note', content: 'Test note' })
    });
    assert.strictEqual(noAuthRes.status, 403);

    // 2. Wrong userId (e.g., '999') should return 404 (board not found or unauthorized)
    const wrongUserRes = await fetch(`${baseUrl}/api/boards/${boardId}/elements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-id': '999' },
        body: JSON.stringify({ type: 'note', content: 'Test note' })
    });
    assert.strictEqual(wrongUserRes.status, 404);

    // 3. Correct userId ('10') should return 201
    const successRes = await fetch(`${baseUrl}/api/boards/${boardId}/elements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-id': '10' },
        body: JSON.stringify({ type: 'note', content: 'Test note' })
    });
    assert.strictEqual(successRes.status, 201);
    const el = await successRes.json();
    assert.strictEqual(el.type, 'note');
    assert.strictEqual(el.board_id, boardId);
});


