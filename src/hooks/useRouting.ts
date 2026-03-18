/**
 * useRouting — 수동 라우팅 캡슐화 훅
 *
 * App.tsx에서 추출.
 * path 해석, navigateTo, popstate 감시, ROUTES 상수 기반.
 * React Router 도입 시 이 훅만 교체하면 됨.
 */
import { useState, useEffect, useCallback } from 'react';
import { ROUTES } from '../constants/routes';

export type PageType = 'landing' | 'home' | 'blog' | 'card_news' | 'press' | 'refine' | 'image' | 'history' | 'admin' | 'auth';

export const contentPages: PageType[] = ['blog', 'card_news', 'press', 'refine', 'image', 'history'];
export const appPages: PageType[] = ['home', ...contentPages];

function getPageFromPath(): PageType {
  const hash = window.location.hash;

  // OAuth 콜백
  if (hash && (hash.includes('access_token') || hash.includes('error'))) {
    return 'landing';
  }

  // 해시 URL 호환 → path 리다이렉트
  if (hash && hash !== '#') {
    const hashPage = hash.replace('#', '');
    const targetPath = hashPage === 'app' ? ROUTES.home : `/${hashPage}`;
    window.history.replaceState(null, '', targetPath);
    if (hashPage === 'admin') return 'admin';
    if (hashPage === 'auth' || hashPage === 'login' || hashPage === 'register') return 'auth';
    if (hashPage === 'app') return 'home';
    if (contentPages.includes(hashPage as PageType)) return hashPage as PageType;
    return 'landing';
  }

  // path 기반 판별
  const path = window.location.pathname.replace(/^\//, '');
  if (path === 'admin') return 'admin';
  if (path === 'auth' || path === 'login' || path === 'register') return 'auth';
  if (path === 'app') return 'home';
  if (contentPages.includes(path as PageType)) return path as PageType;
  return 'landing';
}

export function navigateTo(page: string) {
  const targetPath = page === 'home' ? ROUTES.home : `/${page}`;
  window.history.pushState(null, '', targetPath);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRouting() {
  const [currentPage, setCurrentPage] = useState<PageType>(getPageFromPath);

  // popstate 감시
  useEffect(() => {
    const handlePopState = () => {
      const newPage = getPageFromPath();
      setCurrentPage(prev => {
        if (prev !== newPage) window.scrollTo({ top: 0, behavior: 'smooth' });
        return newPage;
      });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = useCallback((page: PageType) => {
    navigateTo(page);
    setCurrentPage(page);
  }, []);

  return { currentPage, setCurrentPage, handleNavigate };
}
