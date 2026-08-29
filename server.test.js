const request = require('supertest');
const app = require('./server');

describe('DELETE /api/tasks/:id', () => {
    let testUserId = 1;
    let createdTaskId;

    // Need to give time for the schema to initialize.
    beforeAll(async () => {
        // Wait for a brief moment for the DB to initialize properly.
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    beforeEach(async () => {
        // We first need a user, because of FOREIGN KEY constraint 'user_id' REFERENCES 'users'('id')
        // since we enabled 'PRAGMA foreign_keys = ON;'

        await request(app)
            .post('/api/signup')
            .send({ name: 'Test User', email: 'test@example.com', password: 'password' });

        const loginRes = await request(app)
            .post('/api/login')
            .send({ email: 'test@example.com', password: 'password' });

        if (loginRes.body.user && loginRes.body.user.id) {
            testUserId = loginRes.body.user.id;
        } else if (loginRes.body.userId) {
            testUserId = loginRes.body.userId;
        }

        // Create a test task before each test
        const res = await request(app)
            .post('/api/tasks')
            .send({ userId: testUserId, title: 'Test Task to Delete' });

        if (res.statusCode !== 201) {
            console.error('Failed to create test task:', res.body);
        }
        createdTaskId = res.body.id;
    });

    it('should delete a task successfully when correct userId is provided', async () => {
        const res = await request(app)
            .delete(`/api/tasks/${createdTaskId}`)
            .query({ userId: testUserId });
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
    });

    it('should return 403 if userId is missing', async () => {
        const res = await request(app)
            .delete(`/api/tasks/${createdTaskId}`);
        expect(res.statusCode).toEqual(403);
        expect(res.body.error).toBe('Unauthorized: userId required.');
    });

    it('should return 404 if task does not exist or unauthorized (wrong user)', async () => {
        const res = await request(app)
            .delete(`/api/tasks/${createdTaskId}`)
            .query({ userId: 999 }); // Wrong user ID
        expect(res.statusCode).toEqual(404);
        expect(res.body.error).toBe('Task not found or unauthorized.');
    });

    it('should return 404 if task ID does not exist', async () => {
        const res = await request(app)
            .delete(`/api/tasks/99999999`)
            .query({ userId: testUserId });
        expect(res.statusCode).toEqual(404);
        expect(res.body.error).toBe('Task not found or unauthorized.');
    });
});
