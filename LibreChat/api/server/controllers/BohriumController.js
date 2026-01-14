const axios = require('axios');
const bcrypt = require('bcryptjs');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { findUser, createUser, updateUser } = require('~/models');
const { setAuthTokens } = require('~/server/services/AuthService');
const { getAppConfig } = require('~/server/services/Config');

/**
 * 处理 Bohrium 登录请求
 * 
 * Args:
 *   req (Object): Express 请求对象，需包含 headers.cookie
 *   res (Object): Express 响应对象
 * 
 * Returns:
 *   Promise<void>: 不直接返回，而是通过 res 发送响应
 */
const bohriumLoginController = async (req, res) => {
    // 1. 从请求头中提取 Cookie
    // 注意：req.cookies 可能被 parser 处理过，但为了保险，我们尝试从 headers.cookie 手动解析或直接使用 req.cookies
    // 这里假设 cookie-parser 中间件已运行，直接读取 req.cookies
    // 根据 br_sdk.py: 需要 'appAccessKey' 和 'clientName'

    const { appAccessKey, clientName } = req.cookies || {};

    if (!appAccessKey || !clientName) {
        logger.warn('[bohriumLogin] 缺少必要的 Cookie (appAccessKey 或 clientName)');
        return res.status(401).json({ message: 'Missing authentication cookies' });
    }

    try {
        // 2. 调用 Bohrium API 验证身份
        const boRes = await axios.get('https://openapi.dp.tech/openapi/v1/ak/user', {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'x-access-key': appAccessKey,
                'accessKey': appAccessKey,
                'x-app-key': clientName
            },
            timeout: 5000 // 5秒超时
        });

        const boData = boRes.data;
        // 根据实际 API 响应: {"code":0,"data":{"bohr_user_id":1493480,"user_id":"6z023dyl","name":"Ventus Sha"}}

        // 防御性检查 API 返回结构
        const userData = boData.data || boData;
        const boUserId = userData.bohr_user_id || userData.id || userData.user_id;
        const boUsername = userData.name || userData.username;

        if (!boUserId) {
            logger.error('[bohriumLogin] API 返回数据缺失 User ID', boData);
            return res.status(401).json({ message: 'Invalid Bohrium response' });
        }

        logger.info(`[bohriumLogin] Bohrium 验证成功: ${boUsername} (ID: ${boUserId})`);

        // 3. 在 LibreChat 数据库中查找或创建用户
        let user = await findUser({ bohriumId: String(boUserId) });

        if (!user) {
            logger.info(`[bohriumLogin] 用户不存在，创建新用户: Bohrium ID ${boUserId}`);

            // 生成唯一的占位符邮箱
            const placeholderEmail = `bohrium_${boUserId}@placeholder.com`;

            // 检查该邮箱是否已被占用 (极端情况)
            const existingEmail = await findUser({ email: placeholderEmail });
            if (existingEmail) {
                // 如果邮箱已存在但没关联 bohriumId，进行关联
                logger.info(`[bohriumLogin] 检测到同名邮箱 ${placeholderEmail}，进行关联`);
                user = await updateUser(existingEmail._id, { bohriumId: String(boUserId) });
            } else {
                const appConfig = await getAppConfig();

                // 统一默认密码: 12345678 (已加密)
                const defaultPassword = '12345678';
                const salt = bcrypt.genSaltSync(10);
                const hashedPassword = bcrypt.hashSync(defaultPassword, salt);

                // 创建新用户
                user = await createUser({
                    email: placeholderEmail,
                    username: boUsername || `User${boUserId}`,
                    name: boUsername || `Bohrium User`,
                    provider: 'bohrium',
                    password: hashedPassword,
                    emailVerified: true,
                    role: SystemRoles.USER,
                    bohriumId: String(boUserId)
                }, appConfig.balance);
            }
        }

        // 4. 签发 JWT
        const token = await setAuthTokens(user._id, res);

        // 返回成功信息
        res.status(200).json({
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        logger.error('[bohriumLogin] 登录流程异常', error);
        // 区分 axios 错误和其他错误
        if (error.response) {
            return res.status(error.response.status).json({ message: 'Bohrium API authentication failed' });
        }
        return res.status(500).json({ message: 'Internal server error during authentication' });
    }
};

module.exports = { bohriumLoginController };
