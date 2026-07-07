/**
 * 文件下载路由
 * 
 * 功能: 允许用户下载自己数据集目录中的文件
 * 安全: 验证用户身份并防止目录遍历攻击
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireJwtAuth } = require('~/server/middleware');
const { logger } = require('~/config');

const router = express.Router();

// 存储根目录 (需与stock-mcp保持一致)
const STORAGE_ROOT =
  process.env.LIBRECHAT_USER_DATA_DIR || path.resolve(process.cwd(), '..', 'librechat_user_data');

/**
 * 验证文件名是否安全 (防止目录遍历)
 * 
 * Args:
 *   filename: 待验证的文件名
 * 
 * Returns:
 *   true 如果文件名安全，false 否则
 */
function isSafeFilename(filename) {
    // 不允许包含路径分隔符或..
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        return false;
    }
    // 必须有扩展名
    if (!filename.includes('.')) {
        return false;
    }
    return true;
}

/**
 * GET /download/:filename
 * 下载用户数据集目录中的文件
 * 
 * 安全验证:
 *   1. JWT认证确保用户身份
 *   2. 文件名清洗防止目录遍历
 *   3. 文件路径必须在用户目录内
 */
router.get('/:filename', requireJwtAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { filename } = req.params;

        if (!userId) {
            logger.warn('[Download API] 请求缺少用户ID');
            return res.status(401).json({ error: '未授权' });
        }

        if (!filename || !isSafeFilename(filename)) {
            logger.warn(`[Download API] 不安全的文件名: ${filename}`);
            return res.status(400).json({ error: '无效的文件名' });
        }

        // 构建文件路径
        const userDatasetDir = path.join(STORAGE_ROOT, userId, 'dataset');
        const filePath = path.join(userDatasetDir, filename);

        // 二次验证: 确保解析后的路径仍在用户目录内
        const resolvedPath = path.resolve(filePath);
        const resolvedUserDir = path.resolve(userDatasetDir);

        if (!resolvedPath.startsWith(resolvedUserDir + path.sep) && resolvedPath !== resolvedUserDir) {
            logger.warn(`[Download API] 路径遍历尝试被阻止: ${filePath}`);
            return res.status(403).json({ error: '禁止访问' });
        }

        // 检查文件是否存在
        if (!fs.existsSync(resolvedPath)) {
            logger.info(`[Download API] 文件不存在: ${resolvedPath}`);
            return res.status(404).json({ error: '文件不存在' });
        }

        // 获取文件信息
        const stat = fs.statSync(resolvedPath);
        if (!stat.isFile()) {
            return res.status(400).json({ error: '不是有效文件' });
        }

        // 设置响应头
        const ext = path.extname(filename).toLowerCase();
        let contentType = 'application/octet-stream';
        if (ext === '.json') {
            contentType = 'application/json';
        } else if (ext === '.csv') {
            contentType = 'text/csv';
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.setHeader('Content-Length', stat.size);

        // 流式发送文件
        const readStream = fs.createReadStream(resolvedPath);
        readStream.pipe(res);

        logger.info(`[Download API] 文件下载: ${filename}, 用户: ${userId}`);

    } catch (error) {
        logger.error(`[Download API] 下载失败: ${error.message}`, error);
        res.status(500).json({ error: '下载失败' });
    }
});

module.exports = router;
