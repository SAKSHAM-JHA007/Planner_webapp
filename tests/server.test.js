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
