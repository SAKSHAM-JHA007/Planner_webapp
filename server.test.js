const request = require('supertest');
const app = require('./server');

describe('Server Endpoints', () => {
    // We will use this user across tests
    const testUser = {
        name: 'Test User',
        email: `testuser_${Date.now()}@example.com`,
        password: 'password123'
    };

    let userId;

    describe('GET /', () => {
        it('should return the home page', async () => {
            const res = await request(app).get('/');
            expect(res.statusCode).toEqual(200);
            expect(res.headers['content-type']).toMatch(/text\/html/);
        });
    });

    describe('POST /api/signup', () => {
        it('should create a new user', async () => {
            const res = await request(app)
                .post('/api/signup')
                .send(testUser);

            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('userId');
            expect(res.body).toHaveProperty('message', 'User registered successfully!');

            userId = res.body.userId;
        });

        it('should fail if email already exists', async () => {
            const res = await request(app)
                .post('/api/signup')
                .send(testUser);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Email already exists.');
        });
    });

    describe('POST /api/login', () => {
        it('should login an existing user', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({
                    email: testUser.email,
                    password: testUser.password
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message', 'Login successful!');
            expect(res.body.user).toHaveProperty('id', userId);
        });

        it('should fail with invalid credentials', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({
                    email: testUser.email,
                    password: 'wrongpassword'
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Invalid email or password.');
        });
    });

    describe('Tasks API', () => {
        let taskId;

        it('should create a new task', async () => {
            const res = await request(app)
                .post('/api/tasks')
                .send({
                    userId: userId,
                    title: 'Test Task',
                    description: 'This is a test task'
                });

            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('id');
            expect(res.body.title).toEqual('Test Task');

            taskId = res.body.id;
        });

        it('should fetch tasks for a user', async () => {
            const res = await request(app)
                .get(`/api/tasks?userId=${userId}`);

            expect(res.statusCode).toEqual(200);
            expect(Array.isArray(res.body)).toBeTruthy();
            expect(res.body.length).toBeGreaterThan(0);
            expect(res.body[0]).toHaveProperty('id', taskId);
        });
    });
});
