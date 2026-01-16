/**
 * Recoil 状态管理 - 主题配置
 *
 * 功能:
 * - 全局主题状态管理
 * - 持久化到 localStorage
 * - 跨组件实时同步
 *
 * 创建日期: 2026-01-15
 */

import { atom } from 'recoil';
import type { ThemeColor } from '../components/feature/ThemeSelector';

/**
 * 主题状态
 * 默认从 localStorage 读取，未设置则使用 'pink'
 */
export const themeState = atom<ThemeColor>({
  key: 'theme',
  default: (localStorage.getItem('theme') as ThemeColor) || 'pink',
  effects: [
    // 同步到 localStorage
    ({ onSet }) => {
      onSet((newTheme) => {
        localStorage.setItem('theme', newTheme);
      });
    },
  ],
});
