/**
 * Route Constants — 페이지 경로의 single source of truth
 *
 * 현재는 App.tsx의 수동 라우팅에서 참조.
 * 향후 React Router 도입 시 route config로 바로 매핑 가능.
 */

export const ROUTES = {
  landing: '/',
  home: '/app',
  blog: '/blog',
  card_news: '/card_news',
  press: '/press',
  refine: '/refine',
  image: '/image',
  history: '/history',
  admin: '/admin',
  auth: '/auth',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
export type RouteKey = keyof typeof ROUTES;
