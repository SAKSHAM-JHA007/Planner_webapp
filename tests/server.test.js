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

test('POST /api/sync-user rejects request without authentication token', async () => {
    const res = await fetch(`${baseUrl}/api/sync-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Unauthenticated User', email: 'unauth@gmail.com' })
    });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, 'Authentication token is required.');
});

test('POST /api/sync-user verifies token against external provider when SUPABASE_URL is configured', async () => {
    const http = require('node:http');
    let mockSupabaseServer;
    let mockUrl;

    const oauthEmail = `oauth_verified_${Date.now()}@gmail.com`;

    await new Promise((resolve) => {
        mockSupabaseServer = http.createServer((req, res) => {
            if (req.url === '/auth/v1/user') {
                const auth = req.headers['authorization'];
                if (auth === 'Bearer valid_token') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ email: oauthEmail }));
                } else if (auth === 'Bearer mismatch_token') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ email: 'mismatch@gmail.com' }));
                } else {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid token' }));
                }
            } else {
                res.writeHead(404);
                res.end();
            }
        });
        mockSupabaseServer.listen(0, () => {
            mockUrl = `http://127.0.0.1:${mockSupabaseServer.address().port}`;
            resolve();
        });
    });

    const origUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = mockUrl;

    try {
        // 1. Invalid token -> 401
        const invalidRes = await fetch(`${baseUrl}/api/sync-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer invalid_token' },
            body: JSON.stringify({ name: 'OAuth User', email: oauthEmail })
        });
        assert.strictEqual(invalidRes.status, 401);

        // 2. Token email mismatch -> 400
        const mismatchRes = await fetch(`${baseUrl}/api/sync-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer mismatch_token' },
            body: JSON.stringify({ name: 'OAuth User', email: oauthEmail })
        });
        assert.strictEqual(mismatchRes.status, 400);

        // 3. Valid token -> 201
        const validRes = await fetch(`${baseUrl}/api/sync-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid_token' },
            body: JSON.stringify({ name: 'OAuth User', email: oauthEmail })
        });
        assert.strictEqual(validRes.status, 201);
    } finally {
        process.env.SUPABASE_URL = origUrl;
        if (mockSupabaseServer) await new Promise((resolve) => mockSupabaseServer.close(resolve));
    }
});

test('GET /api/users/export serves downloadable users.txt', async () => {
    const res = await fetch(`${baseUrl}/api/users/export`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/plain'));
    const text = await res.text();
    assert.ok(text.includes('FLOWBOARD - REGISTERED USERS DATA'));
});

test('POST /api/boards/:id/connections requires authorization and ownership', async () => {
    // 1. Create a board for User 5
    const boardRes = await fetch(`${baseUrl}/api/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-id': '5' },
        body: JSON.stringify({ title: 'User 5 Board' })
    });
    assert.strictEqual(boardRes.status, 201);
    const board = await boardRes.json();

    // 2. Attempt connection creation without userId -> should return 403 Forbidden
    const unauthRes = await fetch(`${baseUrl}/api/boards/${board.id}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_id: 1, to_id: 2 })
    });
    assert.strictEqual(unauthRes.status, 403);

    // 3. Attempt connection creation with wrong userId (e.g. User 99) -> should return 404 Not Found
    const wrongUserRes = await fetch(`${baseUrl}/api/boards/${board.id}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-id': '99' },
        body: JSON.stringify({ from_id: 1, to_id: 2 })
    });
    assert.strictEqual(wrongUserRes.status, 404);

    // 4. Attempt connection creation with correct userId (User 5) -> should return 201 Created
    const validRes = await fetch(`${baseUrl}/api/boards/${board.id}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-id': '5' },
        body: JSON.stringify({ from_id: 1, to_id: 2, style: 'dashed', label: 'Test Link' })
    });
    assert.strictEqual(validRes.status, 201);
    const connData = await validRes.json();
    assert.strictEqual(connData.board_id, board.id);
    assert.strictEqual(connData.from_id, 1);
    assert.strictEqual(connData.to_id, 2);
    assert.strictEqual(connData.style, 'dashed');
});

test('POST, PUT, DELETE /api/boards/:id/elements require authorization and ownership', async () => {
    // 1. Create board for User 10
    const boardRes = await fetch(`${baseUrl}/api/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-id': '10' },
        body: JSON.stringify({ title: 'User 10 Board' })
    });
    assert.strictEqual(boardRes.status, 201);
    const board = await boardRes.json();

    // 2. Element creation without userId -> 401
    const unauthCreate = await fetch(`${baseUrl}/api/boards/${board.id}/elements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'note', content: 'Secret Note' })
    });
    assert.strictEqual(unauthCreate.status, 401);

    // 3. Element creation by wrong user -> 404
    const wrongUserCreate = await fetch(`${baseUrl}/api/boards/${board.id}/elements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-id': '99' },
        body: JSON.stringify({ type: 'note', content: 'Secret Note' })
    });
    assert.strictEqual(wrongUserCreate.status, 404);

    // 4. Element creation by owner (User 10) -> 201
    const validCreate = await fetch(`${baseUrl}/api/boards/${board.id}/elements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-id': '10' },
        body: JSON.stringify({ type: 'note', content: 'My Note' })
    });
    assert.strictEqual(validCreate.status, 201);
    const element = await validCreate.json();

    // 5. Element update without userId -> 403
    const unauthUpdate = await fetch(`${baseUrl}/api/boards/${board.id}/elements/${element.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 150 })
    });
    assert.strictEqual(unauthUpdate.status, 403);

    // 6. Element update by wrong user -> 404
    const wrongUserUpdate = await fetch(`${baseUrl}/api/boards/${board.id}/elements/${element.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'user-id': '99' },
        body: JSON.stringify({ x: 150 })
    });
    assert.strictEqual(wrongUserUpdate.status, 404);

    // 7. Element update by owner -> 200
    const validUpdate = await fetch(`${baseUrl}/api/boards/${board.id}/elements/${element.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'user-id': '10' },
        body: JSON.stringify({ x: 150 })
    });
    assert.strictEqual(validUpdate.status, 200);

    // 8. Element deletion without userId -> 403
    const unauthDelete = await fetch(`${baseUrl}/api/boards/${board.id}/elements/${element.id}`, {
        method: 'DELETE'
    });
    assert.strictEqual(unauthDelete.status, 403);

    // 9. Element deletion by wrong user -> 404
    const wrongUserDelete = await fetch(`${baseUrl}/api/boards/${board.id}/elements/${element.id}?userId=99`, {
        method: 'DELETE'
    });
    assert.strictEqual(wrongUserDelete.status, 404);

    // 10. Element deletion by owner -> 200
    const validDelete = await fetch(`${baseUrl}/api/boards/${board.id}/elements/${element.id}?userId=10`, {
        method: 'DELETE'
    });
    assert.strictEqual(validDelete.status, 200);
});

test('DELETE /api/boards/:id/connections/:connId requires authorization and ownership', async () => {
    // Create board for User 12
    const boardRes = await fetch(`${baseUrl}/api/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-id': '12' },
        body: JSON.stringify({ title: 'User 12 Board' })
    });
    assert.strictEqual(boardRes.status, 201);
    const board = await boardRes.json();

    // Create connection
    const connRes = await fetch(`${baseUrl}/api/boards/${board.id}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-id': '12' },
        body: JSON.stringify({ from_id: 1, to_id: 2 })
    });
    assert.strictEqual(connRes.status, 201);
    const conn = await connRes.json();

    // Delete connection without userId -> 403
    const unauthDelete = await fetch(`${baseUrl}/api/boards/${board.id}/connections/${conn.id}`, {
        method: 'DELETE'
    });
    assert.strictEqual(unauthDelete.status, 403);

    // Delete connection with wrong userId -> 404
    const wrongUserDelete = await fetch(`${baseUrl}/api/boards/${board.id}/connections/${conn.id}?userId=99`, {
        method: 'DELETE'
    });
    assert.strictEqual(wrongUserDelete.status, 404);

    // Delete connection with owner userId -> 200
    const validDelete = await fetch(`${baseUrl}/api/boards/${board.id}/connections/${conn.id}?userId=12`, {
        method: 'DELETE'
    });
    assert.strictEqual(validDelete.status, 200);
});

