
import { useRef, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// 调试日志
const log = (message: string) => {
    if (import.meta.env.VITE_DEBUG_MODE === 'true') {
        console.log(`[AgentIframe] ${message}`);
    }
};

/**
 * Agent iframe 常驻容器
 * 
 * 功能：
 * 1. 独立于路由系统，始终挂载在 DOM 树中（persistence）
 * 2. 仅在路由匹配 /data-acquisition 时显示（visibility控制）
 * 3. 负责 iframe 的加载状态（Loading/Error）管理
 * 4. 自动计算 Top 偏移量以适配 V2 Header
 */
export default function AgentIframe() {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const location = useLocation();

    // 状态管理
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false); // 标记是否第一次加载完成

    // 路由判断
    const isVisible = location.pathname === '/data-acquisition';
    const agentUrl = import.meta.env.VITE_AGENT_URL;

    // 1. iframe onLoad 事件处理
    const handleIframeLoad = () => {
        log('Iframe loaded');
        setIsLoading(false);
        setHasError(false);
        setHasLoaded(true);

        // 延迟查询一次状态，确保 Agent 内部初始化完毕
        setTimeout(() => {
            // 注意：这里使用 postMessage 进行初始握手
            if (iframeRef.current && agentUrl) {
                iframeRef.current.contentWindow?.postMessage(
                    { type: 'QUERY_AUTH_STATUS' },
                    window.location.origin
                );
            }
        }, 500);
    };

    // 2. iframe error 处理
    const handleIframeError = () => {
        log('Iframe load error');
        setIsLoading(false);
        setHasError(true);
    };

    // 3. 可见性变化副作用：每次切回来时，重新查询状态
    useEffect(() => {
        if (isVisible && hasLoaded && iframeRef.current && agentUrl) {
            log('Visibility changed to true, syncing state...');
            iframeRef.current.contentWindow?.postMessage(
                { type: 'QUERY_AUTH_STATUS' },
                window.location.origin
            );
        }
    }, [isVisible, hasLoaded, agentUrl]);

    return (
        <div
            className="fixed left-0 right-0 bottom-0 z-40 transition-opacity duration-300"
            style={{
                // 关键样式：
                // 1. top: 73px -> 避开 V2 的 Sticky Header
                // 2. visibility -> 使用 visibility 而非 display:none 以保留 DOM 状态
                // 3. pointerEvents -> 隐藏时无法交互
                top: '73px',
                visibility: isVisible ? 'visible' : 'hidden',
                pointerEvents: isVisible ? 'auto' : 'none',
                opacity: isVisible ? 1 : 0
            }}
        >
            {/* Loading 状态遮罩 - 仅在首次加载且页面可见时显示 */}
            {isLoading && isVisible && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-50">
                    <div className="text-center">
                        <div className="inline-block w-12 h-12 border-4 border-pink-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-lg text-gray-700 font-medium">正在连接 Agent 服务...</p>
                        <p className="text-sm text-gray-500 mt-2">Connecting to {agentUrl}...</p>
                    </div>
                </div>
            )}

            {/* Error 状态遮罩 */}
            {hasError && isVisible && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-50">
                    <div className="text-center max-w-md p-8 bg-white shadow-lg rounded-xl border border-gray-200">
                        <i className="ri-error-warning-line text-5xl text-red-500 mb-4 inline-block"></i>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">连接失败</h3>
                        <p className="text-gray-600 mb-6">
                            无法连接到 Agent 服务。<br />
                            请确认后台服务 ({agentUrl}) 是否已启动。
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors"
                        >
                            重新加载
                        </button>
                    </div>
                </div>
            )}

            {/* 核心 iframe */}
            <iframe
                ref={iframeRef}
                src={agentUrl?.startsWith('http') ? agentUrl : `${window.location.origin}${agentUrl}`}
                className="w-full h-full border-none"
                title="Agent"
                allow="clipboard-read; clipboard-write; microphone"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
            />
        </div>
    );
}
