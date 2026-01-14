import { useState, useEffect, useRef } from 'react';

export type ThemeColor = 'pink' | 'light' | 'dark' | 'blue' | 'green' | 'purple';

interface ThemeSelectorProps {
  currentTheme: ThemeColor;
  onThemeChange: (theme: ThemeColor) => void;
}

export default function ThemeSelector({ currentTheme, onThemeChange }: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allColors: ThemeColor[] = ['pink', 'light', 'dark', 'blue', 'green', 'purple'];
  const availableColors = allColors.filter(color => color !== currentTheme);

  const colorConfig: Record<ThemeColor, { bg: string; name: string; ring: string }> = {
    pink: { bg: 'bg-pink-600', name: '粉色', ring: 'ring-pink-600' },
    light: { bg: 'bg-white border-2 border-gray-300', name: '亮色', ring: 'ring-gray-300' },
    dark: { bg: 'bg-gray-900', name: '暗色', ring: 'ring-gray-900' },
    blue: { bg: 'bg-blue-600', name: '蓝色', ring: 'ring-blue-600' },
    green: { bg: 'bg-green-600', name: '绿色', ring: 'ring-green-600' },
    purple: { bg: 'bg-purple-600', name: '紫色', ring: 'ring-purple-600' }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleColorSelect = (color: ThemeColor) => {
    onThemeChange(color);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-9 h-9 rounded-full ${colorConfig[currentTheme].bg} cursor-pointer hover:opacity-90 transition-opacity`}
        aria-label="选择主题颜色"
      />
      
      {isOpen && (
        <div className="absolute right-0 top-12 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500">选择主题颜色</p>
          </div>
          <div className="p-2 space-y-1">
            {availableColors.map((color) => (
              <button
                key={color}
                onClick={() => handleColorSelect(color)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className={`w-6 h-6 rounded-full ${colorConfig[color].bg} flex-shrink-0`} />
                <span className="text-sm text-gray-700">{colorConfig[color].name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
