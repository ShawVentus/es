# src/server/mcp/tools/system_tools.py
"""
系统工具 (System Tools)

主要功能:
    1. read_offloaded_data: 读取被卸载到文件的大数据
       - 支持 JSON 和 CSV 格式
       - 支持分页读取 (offset/limit)
       - 安全限制：只允许读取指定存储目录下的文件

使用场景:
    当 MCP 工具（如 get_historical_prices）返回的数据过大时，
    数据会被自动保存到文件，并返回文件路径引用。
    Agent 可以调用此工具读取文件内容。

依赖:
    - fastmcp: MCP 框架
    - src.server.utils.file_manager.FileManager: 文件管理器
"""

from typing import Any, Dict
from fastmcp import FastMCP, Context

from src.server.utils.logger import logger
from src.server.utils.file_manager import FileManager


def register_system_tools(mcp: FastMCP):
    """
    注册系统工具到 MCP 服务器
    
    Args:
        mcp: FastMCP 服务器实例
    """

    @mcp.tool(tags={"system", "file", "core"})
    async def read_offloaded_data(
        file_path: str,
        offset: int = 0,
        limit: int = 50,
        ctx: Context = None
    ) -> Dict[str, Any]:
        """
        读取被卸载到文件的大数据
        
        当其他工具因数据量过大而将结果保存到文件时，可使用此工具读取。
        支持分页读取，避免一次性加载大量数据。
        
        Args:
            file_path: 文件的绝对路径 (由其他工具返回的 file_path 字段)
            offset: 起始偏移量，默认 0
                   - 对于 JSON List: 元素索引
                   - 对于 CSV: 行号 (不含表头)
            limit: 返回的最大条目数，默认 50
                  - 建议不超过 100 以控制 Token 消耗
        
        Returns:
            包含数据和元信息的字典:
            {
                "data": [...],           # 实际数据
                "total": 1000,           # 总条目数
                "offset": 0,             # 当前偏移量
                "limit": 50,             # 返回条目数
                "has_more": True,        # 是否还有更多数据
                "format": "json"         # 文件格式
            }
        
        Raises:
            ValueError: 如果文件路径不安全或文件不存在
        
        使用示例:
            1. 首次读取: read_offloaded_data(file_path="/root/stock-mcp/storage/xxx/data.json")
            2. 读取下一页: read_offloaded_data(file_path="...", offset=50, limit=50)
            3. 读取更多: 根据 has_more 字段判断是否继续翻页
        """
        logger.info(
            f"[read_offloaded_data] 读取文件: {file_path}, offset={offset}, limit={limit}"
        )
        
        # 参数验证
        if not file_path:
            return {
                "error": "file_path 参数不能为空",
                "success": False
            }
        
        if offset < 0:
            return {
                "error": "offset 不能为负数",
                "success": False
            }
        
        if limit <= 0 or limit > 500:
            return {
                "error": "limit 必须在 1-500 之间",
                "success": False
            }
        
        # 安全检查
        if not FileManager.is_safe_path(file_path):
            logger.warning(f"[read_offloaded_data] 不安全的路径访问尝试: {file_path}")
            return {
                "error": f"不允许访问该路径。只能读取 {FileManager.STORAGE_ROOT} 下的文件。",
                "success": False
            }
        
        # 读取文件
        try:
            result = FileManager.read_file_with_pagination(
                file_path=file_path,
                offset=offset,
                limit=limit
            )
            result["success"] = True
            result["file_path"] = file_path
            return result
        except ValueError as e:
            logger.error(f"[read_offloaded_data] 读取失败: {e}")
            return {
                "error": str(e),
                "success": False
            }
        except Exception as e:
            logger.error(f"[read_offloaded_data] 未知错误: {e}")
            return {
                "error": f"读取文件时发生错误: {str(e)}",
                "success": False
            }
