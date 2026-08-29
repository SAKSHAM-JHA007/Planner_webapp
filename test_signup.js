const http = require('http');

function post(url, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
        });
        req.on('error', reject);
        req.write(JSON.stringify(data));
        req.end();
    });
}

async function runTests() {
    console.log('Testing missing fields...');
    let res = await post('http://localhost:3000/api/signup', { name: 'Test' });
    console.log('Missing fields:', res);

    console.log('\nTesting invalid email...');
    res = await post('http://localhost:3000/api/signup', { name: 'Test', email: 'invalid', password: 'Password123!' });
    console.log('Invalid email:', res);

    console.log('\nTesting weak password (no uppercase)...');
    res = await post('http://localhost:3000/api/signup', { name: 'Test', email: 'test@example.com', password: 'password123' });
    console.log('Weak password:', res);

    console.log('\nTesting weak password (no lowercase)...');
    res = await post('http://localhost:3000/api/signup', { name: 'Test', email: 'test@example.com', password: 'PASSWORD123' });
    console.log('Weak password:', res);

    console.log('\nTesting weak password (no numbers)...');
    res = await post('http://localhost:3000/api/signup', { name: 'Test', email: 'test@example.com', password: 'Password' });
    console.log('Weak password:', res);

    console.log('\nTesting short password...');
    res = await post('http://localhost:3000/api/signup', { name: 'Test', email: 'test@example.com', password: 'Pas1' });
    console.log('Short password:', res);

    console.log('\nTesting valid input...');
    res = await post('http://localhost:3000/api/signup', { name: 'Test User', email: 'test1@example.com', password: 'Password123' });
    console.log('Valid input:', res);

    console.log('\nTesting duplicate email...');
    res = await post('http://localhost:3000/api/signup', { name: 'Test User', email: 'test1@example.com', password: 'Password123' });
    console.log('Duplicate email:', res);

}

runTests().catch(console.error);