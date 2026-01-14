# src/server/utils/decorators.py
"""
MCP 工具装饰器 (Decorators)

主要功能:
    1. @auto_offload: 自动数据卸载装饰器
       - 拦截 MCP 工具的返回值
       - 判断数据大小是否超过阈值
       - 超过阈值时自动保存为文件，返回文件引用

设计原则:
    - 对原有工具函数的侵入性最小化
    - 只需在函数签名中添加 ctx: Context 参数，并应用装饰器即可
    - 当数据量小于阈值时，行为完全不变

依赖:
    - fastmcp.server.context.Context: 用于获取 session_id
    - src.server.utils.file_manager.FileManager: 用于文件存储
"""

import json
import inspect
import functools
from typing import Any, Callable, TypeVar, Dict

from src.server.utils.logger import logger
from src.server.utils.file_manager import FileManager
from src.server.utils.request_context import get_current_user_id

# 类型变量，用于保持装饰器的类型签名
F = TypeVar("F", bound=Callable[..., Any])

# 默认卸载阈值 (字符数)
DEFAULT_THRESHOLD = 5000

# 默认预览条目数
DEFAULT_PREVIEW_COUNT = 5


def auto_offload(
    threshold: int = DEFAULT_THRESHOLD,
    preview_count: int = DEFAULT_PREVIEW_COUNT,
    prefix: str = "data",
    category: str = "temp",
    format: str = "json",
    filename_builder: Callable[..., str] = None
) -> Callable[[F], F]:
    """
    自动数据卸载装饰器
    
    当 MCP 工具返回的数据量超过阈值时，自动将数据保存为文件，
    并返回包含文件路径、摘要和预览的引用对象。
    
    使用示例:
        @mcp.tool(tags={"asset"})
        @auto_offload(
            threshold=5000, 
            category="dataset",
            format="csv",
            filename_builder=lambda ticker, start_date, end_date, **_: f"{ticker}_{start_date}_{end_date}"
        )
        async def get_historical_prices(ticker, start_date, end_date, ctx: Context) -> Dict:
            return large_data_list
    
    Args:
        threshold: 触发文件存储的字符数阈值，默认 5000
        preview_count: 返回预览数据的条目数，默认 5
        prefix: 生成文件名的前缀 (当filename_builder为None时使用)，默认 "data"
        category: 存储类别 ("temp" 临时文件, "dataset" 数据集)，默认 "temp"
        format: 文件格式 ("json" 或 "csv")，默认 "json"
        filename_builder: 动态文件名生成函数，接收函数参数并返回文件名 (不含扩展名)
    
    Returns:
        装饰后的函数
    
    注意事项:
        - 被装饰的函数必须有一个名为 `ctx` 的参数，类型为 Context
        - 如果数据量未超过阈值，返回值保持不变
        - category="dataset" 时文件存入用户数据集目录，便于前端展示
    """
    def decorator(func: F) -> F:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            # 执行原始函数
            result = await func(*args, **kwargs)
            
            # 尝试从参数中获取 Context
            ctx = _extract_context(func, args, kwargs)
            
            if ctx is None:
                # 如果没有 Context，无法进行卸载，直接返回原始结果
                logger.warning(
                    f"[auto_offload] 函数 {func.__name__} 未提供 Context 参数，跳过数据卸载"
                )
                return result
            
            # 序列化数据以计算大小
            try:
                serialized = json.dumps(result, ensure_ascii=False, default=str)
            except (TypeError, ValueError) as e:
                logger.warning(
                    f"[auto_offload] 函数 {func.__name__} 返回值无法序列化，跳过数据卸载: {e}"
                )
                return result
            
            data_size = len(serialized)
            
            # 判断是否超过阈值
            if data_size <= threshold:
                logger.debug(
                    f"[auto_offload] {func.__name__} 返回数据 {data_size} 字符，未超过阈值 {threshold}，直接返回"
                )
                return result
            
            # 超过阈值，执行卸载
            logger.info(
                f"[auto_offload] {func.__name__} 返回数据 {data_size} 字符，超过阈值 {threshold}，执行文件卸载"
            )
            
            # 获取 session_id 并创建 FileManager
            # 获取 user_id
            user_id = get_current_user_id()
            
            # 获取 session_id
            session_id = None
            try:
                session_id = getattr(ctx, 'session_id', None)
            except (AttributeError, RuntimeError):
                pass

            if not session_id:
                import uuid
                session_id = f"anonymous_{uuid.uuid4().hex[:8]}"

            # 创建 FileManager（支持分层存储）
            file_manager = FileManager(
                session_id=session_id,
                user_id=user_id,
                category=category
            )
            logger.debug(f"[auto_offload] 使用 user_id={user_id}, category={category} 存储文件")
            
            # 生成动态文件名 (如果提供了filename_builder)
            custom_filename = None
            if filename_builder is not None:
                try:
                    # 收集函数参数用于生成文件名
                    sig = inspect.signature(func)
                    bound_args = sig.bind(*args, **kwargs)
                    bound_args.apply_defaults()
                    all_args = dict(bound_args.arguments)
                    # 移除ctx参数
                    all_args.pop('ctx', None)
                    
                    custom_filename = filename_builder(**all_args)
                    logger.debug(f"[auto_offload] 动态生成文件名: {custom_filename}")
                except Exception as e:
                    logger.warning(f"[auto_offload] 文件名生成失败，使用默认前缀: {e}")
                    custom_filename = None
            
            # 根据格式选择保存方法
            if format == "csv":
                file_path = file_manager.save_csv(
                    data=result, 
                    prefix=prefix, 
                    filename=custom_filename
                )
            else:
                # 默认使用JSON
                if custom_filename:
                    # save_json暂不支持自定义文件名，手动构建
                    safe_filename = file_manager._sanitize_filename(custom_filename) + ".json"
                    file_path = str(file_manager.session_dir / safe_filename)
                    with open(file_path, "w", encoding="utf-8") as f:
                        json.dump(result, f, ensure_ascii=False, indent=2, default=str)
                    logger.info(f"[FileManager] JSON 数据已保存: {file_path}")
                else:
                    file_path = file_manager.save_json(data=result, prefix=prefix)
            
            # 构建返回的引用对象
            reference = _build_reference(
                result=result,
                file_path=file_path,
                data_size=data_size,
                preview_count=preview_count
            )
            
            return reference
        
        return wrapper  # type: ignore
    
    return decorator


def _extract_context(func: Callable, args: tuple, kwargs: dict) -> Any:
    """
    从函数参数中提取 Context 对象
    
    Args:
        func: 被装饰的函数
        args: 位置参数
        kwargs: 关键字参数
    
    Returns:
        Context 对象，如果未找到则返回 None
    """
    # 首先检查 kwargs
    if "ctx" in kwargs:
        return kwargs["ctx"]
    
    # 检查位置参数
    sig = inspect.signature(func)
    params = list(sig.parameters.keys())
    
    if "ctx" in params:
        ctx_index = params.index("ctx")
        if ctx_index < len(args):
            return args[ctx_index]
    
    return None


def _build_reference(
    result: Any,
    file_path: str,
    data_size: int,
    preview_count: int
) -> Dict[str, Any]:
    """
    构建数据引用对象
    
    Args:
        result: 原始返回数据
        file_path: 保存的文件路径
        data_size: 数据字符数
        preview_count: 预览条目数
    
    Returns:
        引用对象，包含:
        - type: "file_reference" (固定标识)
        - file_path: 文件绝对路径
        - format: 文件格式 (json/csv)
        - summary: 数据摘要
        - preview: 前 N 条数据预览
        - total_count: 总条目数 (如果是列表)
        - message: 提示 Agent 如何读取
    """
    reference = {
        "type": "file_reference",
        "file_path": file_path,
        "format": "json",
        "data_size_chars": data_size,
        "message": f"数据量较大 ({data_size} 字符)，已保存到文件。请使用 read_offloaded_data 工具读取详细内容。"
    }
    
    # 添加摘要和预览
    if isinstance(result, list):
        reference["total_count"] = len(result)
        reference["summary"] = f"共 {len(result)} 条记录"
        reference["preview"] = result[:preview_count]
    elif isinstance(result, dict):
        reference["total_count"] = len(result)
        reference["summary"] = f"包含 {len(result)} 个键"
        # 对字典，预览前几个键值对
        preview_keys = list(result.keys())[:preview_count]
        reference["preview"] = {k: result[k] for k in preview_keys}
    else:
        reference["summary"] = f"数据类型: {type(result).__name__}"
        reference["preview"] = str(result)[:500]
    
    return reference
