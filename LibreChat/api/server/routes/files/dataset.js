/**
 * 文件功能：用户数据集文件API
 * 
 * 说明：
 * - 提供用户数据集目录的文件列表查询
 * - 支持前端"我的数据"页面展示MCP工具生成的数据文件
 * - 通过JWT认证获取当前用户ID
 * 
 * 路由：
 * - GET /api/files/dataset - 获取当前用户的数据集文件列表
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('~/config');

const router = express.Router();

/**
 * 存储根目录
 * 与stock-mcp的FileManager.STORAGE_ROOT保持一致
 */
const STORAGE_ROOT =
  process.env.LIBRECHAT_USER_DATA_DIR || path.resolve(process.cwd(), '..', 'librechat_user_data');

/**
 * 格式化文件大小为可读格式
 * 
 * Args:
 *   bytes: 文件字节数
 * 
 * Returns:
 *   格式化后的字符串，如 "2.4 MB"
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * GET /api/files/dataset
 * 获取当前用户的数据集文件列表
 * 
 * 认证：需要JWT Token（由上层中间件处理）
 * 
 * Returns:
 *   JSON数组，每个元素包含：
 *   - filename: 文件名
 *   - size: 文件字节数
 *   - sizeFormatted: 格式化的文件大小
 *   - createdAt: 创建时间
 *   - modifiedAt: 修改时间
 *   - path: 相对路径
 */
router.get('/', async (req, res) => {
    try {
        // 从认证中间件获取用户ID
        const userId = req.user?.id;

        if (!userId) {
            logger.warn('[Dataset API] 请求缺少用户ID');
            return res.status(401).json({
                error: '未授权',
                message: '无法获取用户ID'
            });
        }

        logger.info(`[Dataset API] 获取用户数据集列表 - 用户ID: ${userId}`);

        // 构建用户数据集目录路径
        const userDatasetDir = path.join(STORAGE_ROOT, userId, 'dataset');

        // 检查目录是否存在
        try {
            await fs.access(userDatasetDir);
        } catch (error) {
            // 目录不存在，返回空列表（正常情况，用户可能还没有生成任何数据）
            logger.info(`[Dataset API] 用户数据集目录不存在: ${userDatasetDir}`);
            return res.json([]);
        }

        // 读取目录内容
        const files = await fs.readdir(userDatasetDir);
        logger.debug(`[Dataset API] 找到 ${files.length} 个文件`);

        // 获取每个文件的详细信息
        const fileList = await Promise.all(
            files.map(async (filename) => {
                try {
                    const filePath = path.join(userDatasetDir, filename);
                    const stats = await fs.stat(filePath);

                    // 只返回文件，忽略子目录
                    if (!stats.isFile()) {
                        return null;
                    }

                    return {
                        filename,
                        size: stats.size,
                        sizeFormatted: formatBytes(stats.size),
                        createdAt: stats.birthtime.toISOString(),
                        modifiedAt: stats.mtime.toISOString(),
                        path: `/dataset/${filename}`,
                    };
                } catch (error) {
                    logger.error(`[Dataset API] 读取文件信息失败: ${filename}`, error);
                    return null;
                }
            })
        );

        // 过滤掉null值（子目录或读取失败的文件）
        // 按修改时间倒序排序（最新的在前面）
        const validFiles = fileList
            .filter((file) => file !== null)
            .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

        logger.info(`[Dataset API] 返回 ${validFiles.length} 个文件`);
        res.json(validFiles);

    } catch (error) {
        logger.error('[Dataset API] 获取数据集文件列表失败:', error);
        res.status(500).json({
            error: '服务器内部错误',
            message: error.message,
        });
    }
});

module.exports = router;
