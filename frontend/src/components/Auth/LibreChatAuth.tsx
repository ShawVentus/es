import React, { createContext, useContext, useEffect, useState } from 'react';

// 用户信息类型
interface LibreChatUser {
    id: string;
    name?: string;
    email?: string;
    role?: string;
}

// 类型定义 - 扩展以包含 token 和 user
interface LibreChatAuthContextType {
    isAuthenticated: boolean;
    token: string | null;
    user: LibreChatUser | null;
    checkAuthStatus: () => void;
}

// 创建Context
const LibreChatAuthContext = createContext<LibreChatAuthContextType | undefined>(undefined);

// 调试日志函数
const log = (message: string, ...args: unknown[]) => {
    if (import.meta.env.VITE_DEBUG_MODE === 'true') {
        console.log(`[LibreChatAuth] ${message}`, ...args);
    }
};

// 常量定义
// postMessage需要完整origin，而不是路径
const AGENT_ORIGIN = window.location.origin;
const LIBRECHAT_MESSAGE_PREFIX = 'LIBRECHAT_';

/**
 * LibreChat 认证状态提供者
 * 
 * 功能：
 * 1. 监听来自 Agent iframe 的 postMessage 消息
 * 2. 严格校验消息来源 (Origin) 防止安全漏洞
 * 3. 维护全局 isAuthenticated/token/user 状态并同步到 localStorage
 * 4. 处理多标签页状态同步
 */
export function LibreChatAuthProvider({ children }: { children: React.ReactNode }) {
    // 初始化状态：优先读取 localStorage
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
        return localStorage.getItem('librechat_auth') === 'true';
    });

    const [token, setToken] = useState<string | null>(() => {
        return localStorage.getItem('librechat_token');
    });

    const [user, setUser] = useState<LibreChatUser | null>(() => {
        const stored = localStorage.getItem('librechat_user');
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch {
                return null;
            }
        }
        return null;
    });

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const { type, isAuthenticated: authStatus, token: receivedToken, user: receivedUser } = event.data || {};

            // 1. 过滤：只处理特定前缀的消息，忽略其他来源
            if (typeof type !== 'string' || !type.startsWith(LIBRECHAT_MESSAGE_PREFIX)) {
                return;
            }

            // 2. 安全校验：严格比对 Origin
            // 如果没有配置环境变量，或者来源不匹配，则拒绝
            if (!AGENT_ORIGIN || event.origin !== AGENT_ORIGIN) {
                console.warn(`[Security] Rejected message from unauthorized origin: ${event.origin}. Expected: ${AGENT_ORIGIN}`);
                return;
            }

            log(`Received message: ${type}`, event.data);

            // 3. 状态处理
            switch (type) {
                case 'LIBRECHAT_LOGIN':
                    setIsAuthenticated(true);
                    localStorage.setItem('librechat_auth', 'true');

                    // 存储 token
                    if (receivedToken) {
                        setToken(receivedToken);
                        localStorage.setItem('librechat_token', receivedToken);
                        log('Token stored');
                    }

                    // 存储 user
                    if (receivedUser) {
                        setUser(receivedUser);
                        localStorage.setItem('librechat_user', JSON.stringify(receivedUser));
                        log('User stored:', receivedUser);
                    }

                    log('User logged in');
                    break;

                case 'LIBRECHAT_LOGOUT':
                    setIsAuthenticated(false);
                    setToken(null);
                    setUser(null);
                    localStorage.setItem('librechat_auth', 'false');
                    localStorage.removeItem('librechat_token');
                    localStorage.removeItem('librechat_user');
                    log('User logged out');
                    break;

                case 'LIBRECHAT_AUTH_STATUS':
                    const isAuth = !!authStatus;
                    setIsAuthenticated(isAuth);
                    localStorage.setItem('librechat_auth', String(isAuth));
                    log(`Auth status update: ${isAuth}`);
                    break;

                case 'LIBRECHAT_TOKEN_EXPIRED':
                    setIsAuthenticated(false);
                    setToken(null);
                    localStorage.setItem('librechat_auth', 'false');
                    localStorage.removeItem('librechat_token');
                    log('Token expired');
                    break;
            }
        };

        window.addEventListener('message', handleMessage);

        // 4. 多标签页同步
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'librechat_auth') {
                const newValue = e.newValue === 'true';
                setIsAuthenticated(newValue);
                log(`Synced state from storage: ${newValue}`);
            }
            if (e.key === 'librechat_token') {
                setToken(e.newValue);
            }
        };
        window.addEventListener('storage', handleStorage);

        return () => {
            window.removeEventListener('message', handleMessage);
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

    /**
     * 主动查询 Agent 状态
     * 遍历所有 Title 包含 'Agent' 的 iframe 发送查询指令
     */
    const checkAuthStatus = () => {
        log('Checking auth status...');
        const iframes = document.querySelectorAll<HTMLIFrameElement>('iframe[title*="Agent"]');
        iframes.forEach((iframe) => {
            if (AGENT_ORIGIN) {
                iframe.contentWindow?.postMessage({ type: 'QUERY_AUTH_STATUS' }, AGENT_ORIGIN);
            }
        });
    };

    return (
        <LibreChatAuthContext.Provider value={{ isAuthenticated, token, user, checkAuthStatus }}>
            {children}
        </LibreChatAuthContext.Provider>
    );
}

/**
 * 导出 Hook
 */
export function useLibreChatAuth() {
    const context = useContext(LibreChatAuthContext);
    if (context === undefined) {
        throw new Error('useLibreChatAuth must be used within a LibreChatAuthProvider');
    }
    return context;
}
