"""
MCP Gateway Service - 封装MCP工具的获取和调用逻辑

此服务层负责：
1. 从MCP服务器获取工具列表并转换为OpenAI格式
2. 执行MCP工具调用（通过工具名动态路由）
3. 处理工具执行超时和错误

架构设计：
- 服务层封装业务逻辑，与路由层解耦
- 使用依赖注入获取MCP服务器实例
- 提供统一的错误处理和日志记录
"""

import asyncio
import inspect
from typing import List, Dict, Any, Optional
from src.server.utils.logger import logger


class MCPGatewayService:
    """MCP网关服务 - 提供工具发现和调用功能"""

    def __init__(self, mcp_server):
        """
        初始化MCP网关服务

        Args:
            mcp_server: FastMCP服务器实例
        """
        self.mcp_server = mcp_server
        self._tools_cache = None  # 缓存工具列表
        logger.info("[MCPGatewayService] Service initialized")

    async def get_openai_tools(self) -> List[Dict[str, Any]]:
        """
        获取所有MCP工具的OpenAI格式定义（异步方法）

        Returns:
            List[Dict]: OpenAI格式的工具列表

        格式示例:
        {
            "type": "function",
            "function": {
                "name": "calculate_technical_indicators",
                "description": "Calculate technical indicators",
                "parameters": {
                    "type": "object",
                    "properties": {...},
                    "required": [...]
                }
            }
        }
        """
        try:
            # 从MCP服务器获取工具列表（异步调用）
            mcp_tools = await self._get_mcp_tools()

            # 转换为OpenAI格式
            openai_tools = []
            for tool in mcp_tools:
                openai_tool = self._convert_to_openai_format(tool)
                openai_tools.append(openai_tool)

            logger.info(f"[MCPGatewayService] Converted {len(openai_tools)} tools to OpenAI format")
            return openai_tools

        except Exception as e:
            logger.error(f"[MCPGatewayService] Error getting OpenAI tools: {e}", exc_info=True)
            raise

    async def call_tool(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        timeout: int = 120,
        user_id: str = None
    ) -> Dict[str, Any]:
        """
        调用指定的MCP工具

        Args:
            tool_name: 工具名称
            arguments: 工具参数
            timeout: 超时时间（秒），默认120秒
            user_id: 用户ID（用于上下文传递）

        Returns:
            Dict: 工具执行结果

        Raises:
            ValueError: 工具不存在
            TimeoutError: 执行超时
            Exception: 工具执行错误
        """
        logger.info(f"[MCPGatewayService] Calling tool: {tool_name}")
        logger.debug(f"[MCPGatewayService] Tool arguments: {arguments}")

        # 确保user_id在上下文中（MCP工具需要）
        from src.server.utils.request_context import set_current_user_id, get_current_user_id
        if user_id:
            set_current_user_id(user_id)
            logger.info(f"[MCPGatewayService] ✅ Set user_id to context: {user_id}")
            # 立即验证
            verify = get_current_user_id()
            logger.info(f"[MCPGatewayService] ✅ Verify user_id in context: {verify}")
        else:
            logger.warning(f"[MCPGatewayService] ⚠️ No user_id provided to call_tool()")

        try:
            # 验证工具是否存在（异步调用）
            if not await self._tool_exists(tool_name):
                raise ValueError(f"Tool '{tool_name}' not found in registry")

            # 执行工具调用（带超时）
            result = await asyncio.wait_for(
                self._execute_tool(tool_name, arguments),
                timeout=timeout
            )

            logger.info(f"[MCPGatewayService] Tool '{tool_name}' executed successfully")
            logger.debug(f"[MCPGatewayService] Tool result: {result}")

            return result

        except asyncio.TimeoutError:
            error_msg = f"Tool '{tool_name}' execution timeout after {timeout}s"
            logger.error(f"[MCPGatewayService] {error_msg}")
            raise TimeoutError(error_msg)

        except ValueError as e:
            # 区分工具不存在 vs 工具内部错误
            if "not found" in str(e):
                logger.warning(f"[MCPGatewayService] Tool lookup failed: {e}")
                raise  # 重新抛出"工具不存在"错误
            else:
                # 工具内部的ValueError，不应该返回404
                logger.error(f"[MCPGatewayService] Tool execution error: {e}", exc_info=True)
                raise RuntimeError(f"Tool execution failed: {e}")

        except Exception as e:
            logger.error(f"[MCPGatewayService] Unexpected error calling tool '{tool_name}': {e}", exc_info=True)
            raise

    async def _get_mcp_tools(self) -> List[Any]:
        """
        从MCP服务器获取工具列表（内部异步方法）

        Returns:
            List: MCP工具对象列表
        """
        # 使用缓存避免重复获取
        if self._tools_cache is None:
            # FastMCP使用get_tools()方法（异步）
            if hasattr(self.mcp_server, 'get_tools'):
                tools_result = await self.mcp_server.get_tools()
                # get_tools()返回字典 {tool_name: tool_object}
                if isinstance(tools_result, dict):
                    self._tools_cache = list(tools_result.values())
                else:
                    self._tools_cache = tools_result if isinstance(tools_result, list) else []

                logger.info(f"[MCPGatewayService] Loaded {len(self._tools_cache)} tools from MCP server")
            else:
                logger.warning("[MCPGatewayService] Cannot find get_tools() in MCP server")
                self._tools_cache = []

        return self._tools_cache

    def _convert_to_openai_format(self, mcp_tool: Any) -> Dict[str, Any]:
        """
        将MCP工具转换为OpenAI格式（内部方法）

        Args:
            mcp_tool: MCP工具对象

        Returns:
            Dict: OpenAI格式的工具定义
        """
        # 提取MCP工具的元数据
        tool_name = mcp_tool.name if hasattr(mcp_tool, 'name') else str(mcp_tool)
        tool_description = mcp_tool.description if hasattr(mcp_tool, 'description') else ""

        # 提取inputSchema（MCP格式的参数定义）
        input_schema = {}
        if hasattr(mcp_tool, 'inputSchema'):
            input_schema = mcp_tool.inputSchema
        elif hasattr(mcp_tool, 'parameters'):
            input_schema = mcp_tool.parameters

        # 确保schema有基本结构（OpenAI要求）
        if not input_schema:
            input_schema = {
                "type": "object",
                "properties": {},
                "required": []
            }
        elif isinstance(input_schema, dict):
            # 确保有type字段
            if "type" not in input_schema:
                input_schema["type"] = "object"

            # 检测复杂schema特性（不阻塞功能，仅记录警告）
            if self._has_complex_schema(input_schema):
                logger.warning(
                    f"[MCPGatewayService] Tool '{tool_name}' uses complex schema "
                    f"($ref/anyOf/oneOf/allOf), may need manual verification"
                )

        # 转换为OpenAI格式
        return {
            "type": "function",
            "function": {
                "name": tool_name,
                "description": tool_description or f"Execute {tool_name}",  # 确保有description
                "parameters": input_schema
            }
        }

    def _has_complex_schema(self, schema: dict) -> bool:
        """
        检测是否包含复杂JSON Schema特性（内部方法）

        Args:
            schema: JSON Schema对象

        Returns:
            bool: 是否包含复杂特性（$ref/anyOf/oneOf/allOf）
        """
        schema_str = str(schema)
        complex_keywords = ['$ref', 'anyOf', 'oneOf', 'allOf']
        return any(keyword in schema_str for keyword in complex_keywords)

    async def _tool_exists(self, tool_name: str) -> bool:
        """
        检查工具是否存在（内部异步方法）

        Args:
            tool_name: 工具名称

        Returns:
            bool: 工具是否存在
        """
        tools = await self._get_mcp_tools()
        return any(
            (tool.name if hasattr(tool, 'name') else str(tool)) == tool_name
            for tool in tools
        )

    async def _execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行MCP工具（内部方法）

        Args:
            tool_name: 工具名称
            arguments: 工具参数

        Returns:
            Dict: 工具执行结果
        """
        # 使用FastMCP的get_tool()方法获取工具（异步调用）
        if hasattr(self.mcp_server, 'get_tool'):
            tool = await self.mcp_server.get_tool(tool_name)

            if tool is None:
                raise ValueError(f"Tool '{tool_name}' not found in registry")

            # 调用工具函数（FastMCP工具通常有fn属性）
            if hasattr(tool, 'fn'):
                # 检查是否为异步函数
                if inspect.iscoroutinefunction(tool.fn):
                    result = await tool.fn(**arguments)
                else:
                    result = tool.fn(**arguments)
            elif callable(tool):
                if inspect.iscoroutinefunction(tool):
                    result = await tool(**arguments)
                else:
                    result = tool(**arguments)
            else:
                raise ValueError(f"Tool '{tool_name}' is not callable")

            # 确保返回值是可JSON序列化的
            # 如果不是dict，包装为统一格式
            if not isinstance(result, dict):
                return {"result": result}

            return result

        else:
            raise ValueError("MCP server does not support get_tool() method")
