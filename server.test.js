const request = require('supertest');
const app = require('./server');

describe('Login API', () => {
    // Generate a unique email for each test run to avoid unique constraint failures
    const testUser = {
        name: 'Test User',
        email: `testuser_${Date.now()}@example.com`,
        password: 'securepassword123'
    };

    beforeAll(async () => {
        // Sign up a user to test login against
        await request(app)
            .post('/api/signup')
            .send(testUser);
    });

    it('should return 400 if email is missing', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({
                password: 'securepassword123'
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Email and password are required.');
    });

    it('should return 400 if password is missing', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({
                email: testUser.email
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Email and password are required.');
    });

    it('should return 400 if both are missing', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Email and password are required.');
    });

    it('should return 400 for invalid email', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({
                email: 'wrong@example.com',
                password: 'securepassword123'
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid email or password.');
    });

    it('should return 400 for invalid password', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({
                email: testUser.email,
                password: 'wrongpassword'
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid email or password.');
    });

    it('should return 200 on successful login', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({
                email: testUser.email,
                password: testUser.password
            });
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Login successful!');
        expect(res.body.user).toBeDefined();
        expect(res.body.user.email).toBe(testUser.email);
        expect(res.body.user.name).toBe(testUser.name);
    });
});
