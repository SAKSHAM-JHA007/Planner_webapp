const request = require('supertest');
const app = require('../server');

describe('POST /api/boards', () => {
    let testUserId;

    beforeAll(async () => {
        // Register a user to satisfy the foreign key constraint
        const uniqueEmail = `testuser_${Date.now()}@example.com`;
        const res = await request(app)
            .post('/api/signup')
            .send({
                name: 'Test User',
                email: uniqueEmail,
                password: 'password123'
            });

        testUserId = res.body.userId;
    });

    it('should create a new board and return 201 when valid data is provided via header user-id', async () => {
        const boardData = {
            title: 'Test Board',
            description: 'This is a test board',
            icon: 'test-icon',
            color: '#ffffff'
        };

        const response = await request(app)
            .post('/api/boards')
            .set('user-id', testUserId.toString())
            .send(boardData)
            .set('Accept', 'application/json');

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body.user_id).toBe(testUserId.toString());
        expect(response.body.title).toBe(boardData.title);
        expect(response.body.description).toBe(boardData.description);
        expect(response.body.icon).toBe(boardData.icon);
        expect(response.body.color).toBe(boardData.color);
    });

    it('should create a new board defaulting to user 1 if user-id header is missing', async () => {
        const boardData = {
            title: 'Test Board without userId',
            description: 'This is a test board',
            icon: 'test-icon',
            color: '#ffffff'
        };

        const response = await request(app)
            .post('/api/boards')
            .send(boardData)
            .set('Accept', 'application/json');

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body.user_id).toBe(1);
    });

    it('should return 400 if title is missing', async () => {
        const boardData = {
            description: 'No title board'
        };

        const response = await request(app)
            .post('/api/boards')
            .set('user-id', testUserId.toString())
            .send(boardData)
            .set('Accept', 'application/json');

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Board title is required');
    });
});
