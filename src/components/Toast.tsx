import React, { useState, useEffect, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

// 전역 토스트 상태 관리
let toastListeners: Array<(toasts: ToastItem[]) => void> = [];
let toasts: ToastItem[] = [];
let nextId = 0;

function notifyListeners() {
  toastListeners.forEach(listener => listener([...toasts]));
}

/**
 * 토스트 알림 표시 함수 (컴포넌트 외부에서도 사용 가능)
 */
export function showToast(message: string, type: ToastType = 'info', duration = 3000) {
  const id = nextId++;
  toasts = [...toasts, { id, message, type, duration }];
  notifyListeners();

  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id);
    notifyListeners();
  }, duration);
}

// alert() 대체 헬퍼
export const toast = {
  success: (msg: string, duration?: number) => showToast(msg, 'success', duration),
  error: (msg: string, duration?: number) => showToast(msg, 'error', duration ?? 5000),
  warning: (msg: string, duration?: number) => showToast(msg, 'warning', duration ?? 4000),
  info: (msg: string, duration?: number) => showToast(msg, 'info', duration),
};

const ICON_MAP: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  warning: '!',
  info: 'i',
};

const STYLE_MAP: Record<ToastType, { bg: string; border: string; icon: string; text: string }> = {
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/40',
    border: 'border-emerald-200 dark:border-emerald-700',
    icon: 'bg-emerald-500 text-white',
    text: 'text-emerald-800 dark:text-emerald-200',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-900/40',
    border: 'border-red-200 dark:border-red-700',
    icon: 'bg-red-500 text-white',
    text: 'text-red-800 dark:text-red-200',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-900/40',
    border: 'border-amber-200 dark:border-amber-700',
    icon: 'bg-amber-500 text-white',
    text: 'text-amber-800 dark:text-amber-200',
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-900/40',
    border: 'border-blue-200 dark:border-blue-700',
    icon: 'bg-blue-500 text-white',
    text: 'text-blue-800 dark:text-blue-200',
  },
};

/**
 * 토스트 컨테이너 - App 루트에 한 번만 배치
 */
export const ToastContainer: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    toastListeners.push(setItems);
    return () => {
      toastListeners = toastListeners.filter(l => l !== setItems);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {items.map(item => {
        const style = STYLE_MAP[item.type];
        return (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-xl animate-[slideIn_0.3s_ease-out] ${style.bg} ${style.border}`}
            role="alert"
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${style.icon}`}>
              {ICON_MAP[item.type]}
            </span>
            <p className={`text-sm font-medium leading-relaxed ${style.text}`}>
              {item.message}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default ToastContainer;
