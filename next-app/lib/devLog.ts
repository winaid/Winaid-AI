/**
 * 개발 환경 전용 로그 — 프로덕션에서 자동 무시.
 * console.warn, console.error, console.info 는 그대로 유지.
 */
export const devLog = (...args: unknown[]): void => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...args);
  }
};
