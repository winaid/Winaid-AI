'use client';

import { useState, useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

let toastListeners: Array<(toasts: ToastItem[]) => void> = [];
let toasts: ToastItem[] = [];
let nextId = 0;

function notifyListeners() {
  toastListeners.forEach(listener => listener([...toasts]));
}

export function showToast(message: string, type: ToastType = 'info', duration = 3000) {
  const id = nextId++;
  toasts = [...toasts, { id, message, type, duration }];
  notifyListeners();
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id);
    notifyListeners();
  }, duration);
}

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
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: 'bg-emerald-500 text-white',
    text: 'text-emerald-800',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'bg-red-500 text-white',
    text: 'text-red-800',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'bg-amber-500 text-white',
    text: 'text-amber-800',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'bg-blue-500 text-white',
    text: 'text-blue-800',
  },
};

export function ToastContainer() {
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
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg ${style.bg} ${style.border} animate-[slideIn_0.3s_ease-out]`}
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
}

export default ToastContainer;
