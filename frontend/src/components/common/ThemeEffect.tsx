/**
 * 主题效果组件
 * 功能：监听主题变化并更新全局CSS变量（如滚动条颜色）
 */

import { useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';

// 主题色到具体颜色值的映射
const themeColorMap = {
  pink: {
    thumb: '#ec4899',
    thumbHover: '#db2777',
    track: '#f1f1f1'
  },
  blue: {
    thumb: '#2563eb',
    thumbHover: '#1d4ed8',
    track: '#dbeafe'
  },
  green: {
    thumb: '#16a34a',
    thumbHover: '#15803d',
    track: '#dcfce7'
  },
  purple: {
    thumb: '#9333ea',
    thumbHover: '#7e22ce',
    track: '#f3e8ff'
  },
  light: {
    thumb: '#1f2937',
    thumbHover: '#111827',
    track: '#f3f4f6'
  },
  dark: {
    thumb: '#ffffff',
    thumbHover: '#f3f4f6',
    track: '#1f2937'
  }
};

export default function ThemeEffect() {
  const { theme } = useTheme();

  useEffect(() => {
    // 获取当前主题的滚动条颜色
    const colors = themeColorMap[theme];

    // 更新CSS变量
    const root = document.documentElement;
    root.style.setProperty('--scrollbar-thumb', colors.thumb);
    root.style.setProperty('--scrollbar-thumb-hover', colors.thumbHover);
    root.style.setProperty('--scrollbar-track', colors.track);
  }, [theme]);

  // 这个组件不渲染任何内容
  return null;
}
