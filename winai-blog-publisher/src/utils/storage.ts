/**
 * 사용자 홈 디렉토리 (~/.winai-publisher/) 의 보안 파일 관리.
 *
 * 토큰 / 암호화 키를 OS keychain 대신 filesystem (mode 0600) 에 저장.
 * Electron 환경 아니라 keytar native binding 회피를 위한 선택.
 * 향후 OS keychain 도입 시 본 파일만 교체하면 됨.
 */

import { homedir } from 'os';
import path from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'fs';

const STORAGE_DIR = path.join(homedir(), '.winai-publisher');

function ensureDir(): void {
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o700 });
  }
  // 디렉토리 권한 강제 (이미 존재해도 0700 으로 정정)
  try {
    chmodSync(STORAGE_DIR, 0o700);
  } catch {
    /* Windows 등 chmod 미지원 환경은 무시 */
  }
}

/**
 * 보안 파일 읽기 / 없으면 generator 호출해 생성.
 * 파일 권한 0600 강제 (소유자만 읽기/쓰기).
 *
 * @param filename 파일 이름 (디렉토리 X, 단순 이름)
 * @param generator 파일 없을 때 새 값 생성 함수
 * @returns 파일 내용 (Buffer)
 */
export function loadOrCreateSecret(
  filename: string,
  generator: () => Buffer,
): Buffer {
  ensureDir();
  const filePath = path.join(STORAGE_DIR, filename);

  if (existsSync(filePath)) {
    return readFileSync(filePath);
  }

  const value = generator();
  writeFileSync(filePath, value, { mode: 0o600 });
  try {
    chmodSync(filePath, 0o600);
  } catch {
    /* Windows 등 chmod 미지원 — fall through */
  }
  return value;
}

/** 단순 read (파일 없으면 null). */
export function readSecret(filename: string): Buffer | null {
  const filePath = path.join(STORAGE_DIR, filename);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath);
}

export function getStorageDir(): string {
  return STORAGE_DIR;
}
