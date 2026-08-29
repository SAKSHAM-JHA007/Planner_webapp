const request = require('supertest');
const app = require('../server');

describe('POST /api/tasks', () => {
    it('should create a task successfully with valid data', async () => {
        const response = await request(app)
            .post('/api/tasks')
            .set('user-id', '2')
            .send({ title: 'Test Task' });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body.title).toBe('Test Task');
        expect(response.body.user_id).toBe('2');
        expect(response.body.status).toBe('todo');
    });

    it('should return 400 if title is missing', async () => {
        const response = await request(app)
            .post('/api/tasks')
            .set('user-id', '2')
            .send({ description: 'No title provided' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Title is required');
    });

    it('should create a task with all optional fields', async () => {
        const response = await request(app)
            .post('/api/tasks')
            .set('user-id', '3')
            .send({
                title: 'Full Task',
                description: 'Detailed description',
                status: 'in-progress',
                due_date: '2023-12-31',
                priority: 'high'
            });

        expect(response.status).toBe(201);
        expect(response.body.title).toBe('Full Task');
        expect(response.body.description).toBe('Detailed description');
        expect(response.body.status).toBe('in-progress');
        expect(response.body.due_date).toBe('2023-12-31');
        expect(response.body.priority).toBe('high');
        expect(response.body.user_id).toBe('3');
    });
});
