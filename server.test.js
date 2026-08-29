jest.mock('sqlite3', () => {
    const actualSqlite3 = jest.requireActual('sqlite3');
    return {
        ...actualSqlite3,
        verbose: () => {
            const sqlite3Obj = actualSqlite3.verbose();
            return {
                ...sqlite3Obj,
                Database: function (filename, callback) {
                    return new sqlite3Obj.Database(':memory:', callback);
                }
            };
        }
    };
});

const request = require('supertest');
const app = require('./server');

describe('GET /api/boards', () => {
    it('should return 400 if userId is missing', async () => {
        const res = await request(app).get('/api/boards');
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'userId is required');
    });

    it('should return empty array for a user with no boards', async () => {
        const res = await request(app).get('/api/boards?userId=9999');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it('should return boards with correct element and connection counts', async () => {
        const uniqueEmail = `testuser_${Date.now()}@example.com`;
        const userRes = await request(app)
            .post('/api/signup')
            .send({
                name: 'Test User',
                email: uniqueEmail,
                password: 'password123'
            });

        expect(userRes.status).toBe(201);
        const userId = userRes.body.userId;

        const boardRes = await request(app)
            .post('/api/boards')
            .send({
                userId: userId,
                title: 'Test Board',
                description: 'Test Description'
            });

        expect(boardRes.status).toBe(201);
        const boardId = boardRes.body.id;

        const elemRes = await request(app)
            .post(`/api/boards/${boardId}/elements`)
            .send({
                type: 'text',
                content: 'Hello World'
            });
        expect(elemRes.status).toBe(201);
        const elemId1 = elemRes.body.id;

        const elemRes2 = await request(app)
            .post(`/api/boards/${boardId}/elements`)
            .send({
                type: 'shape'
            });
        expect(elemRes2.status).toBe(201);
        const elemId2 = elemRes2.body.id;

        const connRes = await request(app)
            .post(`/api/boards/${boardId}/connections`)
            .send({
                from_id: elemId1,
                to_id: elemId2
            });
        expect(connRes.status).toBe(201);

        const fetchRes = await request(app).get(`/api/boards?userId=${userId}`);
        expect(fetchRes.status).toBe(200);
        expect(fetchRes.body).toBeInstanceOf(Array);
        expect(fetchRes.body.length).toBeGreaterThanOrEqual(1);

        const testBoard = fetchRes.body.find(b => b.id === boardId);
        expect(testBoard).toBeDefined();
        expect(testBoard.element_count).toBe(2);
        expect(testBoard.connection_count).toBe(1);
    });
});
