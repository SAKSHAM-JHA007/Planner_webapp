const request = require('supertest');
const app = require('../server');

describe('POST /api/signup', () => {
    it('should successfully register a new user', async () => {
        const randomEmail = `testuser_${Date.now()}@example.com`;

        const response = await request(app)
            .post('/api/signup')
            .send({ name: 'Test User', email: randomEmail, password: 'password123' });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('message', 'User registered successfully!');
        expect(response.body).toHaveProperty('userId');
    });

    it('should return 400 if fields are missing', async () => {
        // Missing password
        let response = await request(app)
            .post('/api/signup')
            .send({ name: 'John Doe', email: 'john@example.com' });
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'All fields are required.' });

        // Missing email
        response = await request(app)
            .post('/api/signup')
            .send({ name: 'John Doe', password: 'password123' });
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'All fields are required.' });

        // Missing name
        response = await request(app)
            .post('/api/signup')
            .send({ email: 'john@example.com', password: 'password123' });
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'All fields are required.' });
    });

    it('should return 400 if email already exists', async () => {
        const email = `duplicate_${Date.now()}@example.com`;

        // First registration should succeed
        let response = await request(app)
            .post('/api/signup')
            .send({ name: 'Test User', email: email, password: 'password123' });
        expect(response.status).toBe(201);

        // Second registration with same email should fail
        response = await request(app)
            .post('/api/signup')
            .send({ name: 'Test User 2', email: email, password: 'password456' });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Email already exists.' });
    });
});
