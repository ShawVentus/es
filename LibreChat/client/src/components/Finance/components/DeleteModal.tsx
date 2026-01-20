/**
 * 金融模块 - 删除确认 Modal 组件
 * 
 * 功能：
 * - 现代化的删除确认对话框
 * - 支持 ESC 键关闭
 * - 支持点击背景关闭
 * - 支持删除中状态显示
 * 
 * 创建日期: 2026-01-13
 * 迁移日期: 2026-01-18
 */

import { useEffect, useRef, useCallback } from 'react';

// 调试模式
const DEBUG = import.meta.env.VITE_FINANCE_DEBUG === 'true';

interface DeleteModalProps {
    /** 是否显示 */
    isOpen: boolean;
    /** 要删除的文件名 */
    filename: string;
    /** 关闭回调 */
    onClose: () => void;
    /** 确认删除回调 */
    onConfirm: () => void;
    /** 是否正在删除 */
    isDeleting?: boolean;
    /** 自定义标题 */
    title?: string;
    /** 自定义警告文字 */
    warningText?: string;
}

/**
 * 删除确认弹窗组件
 * 
 * @param props - 组件属性
 * @returns Modal UI 或 null
 */
export function DeleteModal({
    isOpen,
    filename,
    onClose,
    onConfirm,
    isDeleting = false,
    title = '确认删除',
    warningText = '此操作不可恢复',
}: DeleteModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);

    if (DEBUG && isOpen) {
        console.log('[Finance/DeleteModal] open', { filename, isDeleting });
    }

    // ESC 键关闭
    const handleEsc = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape' && isOpen && !isDeleting) {
            if (DEBUG) console.log('[Finance/DeleteModal] ESC pressed, closing');
            onClose();
        }
    }, [isOpen, isDeleting, onClose]);

    useEffect(() => {
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [handleEsc]);

    // 点击背景关闭
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === modalRef.current && !isDeleting) {
            if (DEBUG) console.log('[Finance/DeleteModal] backdrop clicked, closing');
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div
            ref={modalRef}
            onClick={handleBackdropClick}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-scale-in">
                {/* Icon */}
                <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                        <i className="ri-delete-bin-line text-3xl text-red-600" />
                    </div>
                </div>

                {/* Title */}
                <h3 className="text-xl font-bold text-center text-gray-900 mb-2">
                    {title}
                </h3>

                {/* Content */}
                <p className="text-center text-gray-600 mb-6">
                    确定要删除 <strong className="text-gray-900">{filename}</strong> 吗？
                    <br />
                    <span className="text-red-500 text-sm">{warningText}</span>
                </p>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isDeleting}
                        className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        取消
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isDeleting}
                        className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isDeleting ? (
                            <>
                                <i className="ri-loader-4-line animate-spin" />
                                删除中...
                            </>
                        ) : (
                            <>
                                <i className="ri-delete-bin-line" />
                                确认删除
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// 注入动画样式（仅执行一次）
if (typeof document !== 'undefined' && !document.getElementById('finance-delete-modal-styles')) {
    const style = document.createElement('style');
    style.id = 'finance-delete-modal-styles';
    style.textContent = `
    @keyframes scale-in {
      from {
        transform: scale(0.9);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }
    .animate-scale-in {
      animation: scale-in 0.2s ease-out;
    }
  `;
    document.head.appendChild(style);
}

export default DeleteModal;
