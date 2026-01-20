/**
 * 金融模块 - 购买确认弹窗
 *
 * 功能：
 * - 显示文件名和扣费金额
 * - 确认/取消操作
 * - 扣费中/下载中状态提示
 *
 * 创建日期: 2026-01-19
 */

import { useEffect } from 'react';
import { useTheme, getThemeColors } from '../hooks/useTheme';

interface PurchaseModalProps {
  isOpen: boolean;
  filename: string;
  fileCount?: number; // 批量下载时的文件数量
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing?: boolean; // 是否正在处理（扣费或下载中）
}

export function PurchaseModal({
  isOpen,
  filename,
  fileCount = 1,
  onConfirm,
  onCancel,
  isProcessing = false,
}: PurchaseModalProps) {
  const { theme } = useTheme();
  const colors = getThemeColors(theme);

  // ESC 键关闭弹窗
  useEffect(() => {
    if (!isOpen || isProcessing) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isProcessing, onCancel]);

  // 点击背景关闭
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isProcessing) {
      onCancel();
    }
  };

  if (!isOpen) return null;

  const isBatch = fileCount > 1;
  const totalCredits = fileCount;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        className={`relative w-full max-w-md rounded-xl border-2 ${colors.borderColor} p-6 shadow-2xl ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'
          }`}
      >
        {/* 标题 */}
        <div className="mb-4 flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-lg ${theme === 'dark' ? 'bg-purple-900/30' : 'bg-purple-100'
              }`}
          >
            <i
              className={`ri-shopping-cart-line text-2xl ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
                }`}
            />
          </div>
          <div>
            <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {isBatch ? '批量下载确认' : '下载确认'}
            </h3>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              此操作将扣除积分
            </p>
          </div>
        </div>

        {/* 内容 */}
        <div
          className={`mb-6 rounded-lg border ${colors.borderColor} p-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'
            }`}
        >
          {isBatch ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  文件数量
                </span>
                <span className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {fileCount} 个
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  扣费总计
                </span>
                <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                  {totalCredits} 积分
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="mb-3">
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  文件名
                </p>
                <p
                  className={`mt-1 truncate font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'
                    }`}
                  title={filename}
                >
                  {filename}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  扣费金额
                </span>
                <span className="text-lg font-bold text-purple-600 dark:text-purple-400">1 积分</span>
              </div>
            </>
          )}
        </div>

        {/* 提示 */}
        <div
          className={`mb-6 flex items-start gap-2 rounded-lg border ${theme === 'dark' ? 'border-yellow-900/30 bg-yellow-900/10' : 'border-yellow-200 bg-yellow-50'
            } p-3`}
        >
          <i
            className={`ri-information-line text-lg ${theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'
              }`}
          />
          <p className={`text-xs ${theme === 'dark' ? 'text-yellow-300' : 'text-yellow-700'}`}>
            {isBatch
              ? '将逐个扣费下载，确认后开始处理'
              : '扣费成功后即可下载，一次购买永久有效'}
          </p>
        </div>

        {/* 按钮 */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className={`flex-1 rounded-lg border-2 ${colors.borderColor} px-4 py-2.5 font-semibold transition-colors ${isProcessing
                ? 'cursor-not-allowed opacity-50'
                : theme === 'dark'
                  ? 'text-gray-300 hover:bg-gray-800'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={isProcessing}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-white transition-all ${isProcessing
                ? 'cursor-not-allowed bg-gray-500'
                : 'bg-purple-600 hover:bg-purple-700 active:scale-95'
              }`}
          >
            {isProcessing ? (
              <>
                <i className="ri-loader-4-line animate-spin text-lg" />
                处理中...
              </>
            ) : (
              <>
                <i className="ri-check-line text-lg" />
                确认购买
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
