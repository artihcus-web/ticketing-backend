import dotenv from 'dotenv';

dotenv.config();

const testExternalAuth = async () => {
    const token = process.argv[2];
    const apiBase = process.env.VITE_EMPLOYEES_API_URL || 'https://api.artihcus.com:8443/';
    const verifyUrl = `${apiBase.endsWith('/') ? apiBase : apiBase + '/'}api/auth/me`;

    console.log('--- Auth Diagnostic ---');
    console.log(`Environment: ${process.env.NODE_ENV || 'not set'}`);
    console.log(`VITE_EMPLOYEES_API_URL: ${apiBase}`);
    console.log(`Computed Verify URL: ${verifyUrl}`);

    if (!token) {
        console.log('⚠️ No token provided. Running basic connectivity test only.');
        console.log('Usage: node test_auth_conn.js <YOUR_JWT_TOKEN>');
    }

    try {
        console.log(`Testing connectivity to: ${verifyUrl}`);
        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
            console.log(`Using token: ${token.substring(0, 10)}...`);
        }

        const response = await fetch(verifyUrl, {
            method: 'GET',
            headers: headers
        });

        console.log(`Response Status: ${response.status} ${response.statusText}`);

        const text = await response.text();
        console.log('Raw Response Content:');
        console.log(text || '(Empty)');

        try {
            const data = JSON.parse(text);
            console.log('Parsed JSON Body:', JSON.stringify(data, null, 2));
        } catch (e) {
            console.log('Response is not JSON');
        }

        if (response.ok) {
            console.log('✅ External API verification SUCCESS');
        } else {
            console.log('❌ External API verification FAILED');
        }
    } catch (error) {
        console.error('❌ Connection Error:', error.message);
    }
};

testExternalAuth();
