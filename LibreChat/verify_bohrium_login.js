const axios = require('axios');

async function verifyLogin() {
    console.log('Testing Bohrium Login API...');

    // 模拟 Cookie (请替换为真实有效的 Cookie 进行测试)
    // 注意：这只是一个本地 Mock 测试，实际需要有效 Cookie
    const cookie = 'appAccessKey=test_key; clientName=test_client';

    try {
        const res = await axios.post('http://localhost:3080/api/auth/login-bohrium', {}, {
            headers: {
                Cookie: cookie
            },
            validateStatus: () => true // 允许所有状态码
        });

        console.log(`Status: ${res.status}`);
        console.log('Body:', res.data);

        if (res.status === 401 && res.data.message === 'Bohrium API authentication failed') {
            console.log('✅ 预期行为: 无效 Key 被拒绝 (证明 API 链路已通)');
        } else if (res.status === 200) {
            console.log('✅ 登录成功 (如果您使用了真实 Key)');
        } else {
            console.log('⚠️ 未知响应，请检查日志');
        }

    } catch (err) {
        console.error('Request failed:', err.message);
    }
}

verifyLogin();
