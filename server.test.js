const request = require('supertest');

process.env.VERCEL = '1';

const app = require('./server');

describe('GET /api/tasks', () => {

    it('should return tasks for a valid user ID', async () => {
        const mockEmail = `testuser${Date.now()}@example.com`;
        const signupRes = await request(app)
            .post('/api/signup')
            .send({
                name: 'Test User',
                email: mockEmail,
                password: 'password123'
            });

        expect(signupRes.status).toBe(201);
        const userId = signupRes.body.userId;

        const postRes = await request(app)
            .post('/api/tasks')
            .send({
                userId: userId,
                title: 'Integration Test Task'
            });

        expect(postRes.status).toBe(201);

        const response = await request(app).get('/api/tasks').query({ userId: userId });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);
        const task = response.body.find(t => t.title === 'Integration Test Task');
        expect(task).toBeDefined();
    });

    it('should return 400 if userId is missing', async () => {
        const response = await request(app).get('/api/tasks');

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'userId is required');
    });

    it('should return empty array if user has no tasks', async () => {
        const response = await request(app).get('/api/tasks').query({ userId: 999999 });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBe(0);
    });
});
