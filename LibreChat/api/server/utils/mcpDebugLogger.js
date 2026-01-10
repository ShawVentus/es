/**
 * MCP 调试日志工具
 * 用于在 MCP 调用链的关键节点打印调试信息
 * 
 * 功能：
 * 1. 通过 MCP_DEBUG 环境变量控制开关
 * 2. 终端输出简略版日志
 * 3. 文件输出详细版日志到 ./logs/mcp_debug.log
 */

const fs = require('fs');
const path = require('path');

// 日志文件路径
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'mcp_debug.log');

/**
 * 检查调试模式是否启用
 * 
 * Returns:
 *   boolean: 如果 MCP_DEBUG 环境变量为 'true'（不区分大小写）则返回 true
 */
function isDebugEnabled() {
  return process.env.MCP_DEBUG?.toLowerCase() === 'true';
}

/**
 * 确保日志目录存在
 * 
 * 如果 ./logs 目录不存在，则自动创建
 */
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * 安全的 JSON 序列化函数
 * 处理循环引用和不可序列化的对象
 * 
 * Args:
 *   obj: 要序列化的对象
 *   indent: 缩进空格数，默认为 2
 * 
 * Returns:
 *   string: 序列化后的 JSON 字符串
 */
function safeStringify(obj, indent = 2) {
  const seen = new WeakSet();
  
  return JSON.stringify(obj, (key, value) => {
    // 过滤不可序列化的类型
    if (typeof value === 'function') {
      return '[Function]';
    }
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }
    if (value instanceof AbortSignal) {
      return '[AbortSignal]';
    }
    if (value instanceof Response || value instanceof Request) {
      return `[${value.constructor.name}]`;
    }
    if (value && typeof value === 'object' && value.constructor?.name === 'ServerResponse') {
      return '[ServerResponse]';
    }
    
    // 处理循环引用
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    
    return value;
  }, indent);
}

/**
 * 生成简略版日志字符串
 * 
 * Args:
 *   node: 日志节点名称
 *   data: 日志数据对象
 * 
 * Returns:
 *   string: 简略版日志字符串
 */
function formatBriefLog(node, data) {
  const parts = [`[debug][MCP][${node}]`];
  
  if (data.toolName) {
    parts.push(`toolName=${data.toolName}`);
  }
  if (data.serverName) {
    parts.push(`serverName=${data.serverName}`);
  }
  if (data.toolKey) {
    parts.push(`toolKey=${data.toolKey}`);
  }
  if (data.userId) {
    parts.push(`userId=${data.userId}`);
  }
  if (data.toolArguments) {
    const keys = Object.keys(data.toolArguments);
    parts.push(`argsKeys=[${keys.join(', ')}]`);
  }
  if (data.isDomainAllowed !== undefined) {
    parts.push(`isDomainAllowed=${data.isDomainAllowed}`);
  }
  if (data.error) {
    parts.push(`error=${data.error.message || data.error}`);
  }
  if (data.resultType) {
    parts.push(`resultType=${data.resultType}`);
  }
  
  return parts.join(' ');
}

/**
 * 生成详细版日志字符串
 * 
 * Args:
 *   node: 日志节点名称
 *   data: 日志数据对象
 * 
 * Returns:
 *   string: 详细版日志字符串（包含完整 JSON）
 */
function formatDetailedLog(node, data) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    node,
    ...data,
  };
  
  return `\n${'='.repeat(80)}\n[${timestamp}] [${node}]\n${safeStringify(logEntry)}\n`;
}

/**
 * MCP 调试日志主函数
 * 
 * 在终端输出简略版日志，在文件中记录详细版日志
 * 
 * Args:
 *   node: 日志节点名称，用于标识调用链位置
 *         可选值：'CREATE_TOOL_ENTER', 'DOMAIN_CHECK', '_CALL_ENTER', 
 *                'BEFORE_MCP_MANAGER', 'AFTER_MCP_MANAGER', 'ERROR'
 *   data: 日志数据对象，包含 toolName, serverName, toolArguments 等字段
 * 
 * Returns:
 *   void
 */
function mcpDebug(node, data = {}) {
  if (!isDebugEnabled()) {
    return;
  }
  
  try {
    // 终端输出简略版
    const briefLog = formatBriefLog(node, data);
    console.log(briefLog);
    
    // 文件输出详细版
    ensureLogDir();
    const detailedLog = formatDetailedLog(node, data);
    fs.appendFileSync(LOG_FILE, detailedLog);
  } catch (error) {
    // 日志失败不应影响主程序
    console.error('[debug][MCP] 日志记录失败:', error.message);
  }
}

module.exports = {
  mcpDebug,
  isDebugEnabled,
  safeStringify,
};
