/**
 * 删除确认 Modal 组件
 * 
 * 现代化的删除确认对话框，替代原生 confirm()
 * 
 * 创建日期: 2026-01-13
 */

import { useEffect, useRef } from 'react';

interface DeleteModalProps {
    isOpen: boolean;
    filename: string;
    onClose: () => void;
    onConfirm: () => void;
    isDeleting?: boolean;
}

export function DeleteModal({ isOpen, filename, onClose, onConfirm, isDeleting = false }: DeleteModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);

    // ESC 键关闭
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    // 点击背景关闭
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === modalRef.current) {
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
                        <i className="ri-delete-bin-line text-3xl text-red-600"></i>
                    </div>
                </div>

                {/* Title */}
                <h3 className="text-xl font-bold text-center text-gray-900 mb-2">
                    确认删除
                </h3>

                {/* Content */}
                <p className="text-center text-gray-600 mb-6">
                    确定要删除 <strong className="text-gray-900">{filename}</strong> 吗？
                    <br />
                    <span className="text-red-500 text-sm">此操作不可恢复</span>
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
                                <i className="ri-loader-4-line animate-spin"></i>
                                删除中...
                            </>
                        ) : (
                            <>
                                <i className="ri-delete-bin-line"></i>
                                确认删除
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// 添加简单的 CSS 动画
const style = document.createElement('style');
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
if (typeof document !== 'undefined' && !document.getElementById('delete-modal-styles')) {
    style.id = 'delete-modal-styles';
    document.head.appendChild(style);
}
