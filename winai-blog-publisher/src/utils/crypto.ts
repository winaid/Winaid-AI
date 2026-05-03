/**
 * 자격증명 암호화 (AES-256-GCM).
 *
 * v1 (legacy): CryptoJS.AES.encrypt(json, hardcodedKey).toString() — PBKDF1 약함, 하드코딩 키.
 * v2 (current): Node native aes-256-gcm + ~/.winai-publisher/encryption.key (mode 0600) 무작위 키.
 *
 * 첫 실행 시 v1 파일 검출되면 자동 마이그레이션 (옛 키로 복호화 → 새 키로 재암호화).
 * 실패 시 명시적 에러 + 사용자 재로그인 안내.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import CryptoJS from 'crypto-js';
import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { loadOrCreateSecret } from './storage';

const CRED_DIR = path.join(process.cwd(), 'credentials');
const KEY_FILENAME = 'encryption.key';
const KEY_BYTES = 32; // AES-256

const LEGACY_FALLBACK_KEY = 'winai-local-publisher-2026';

let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  cachedKey = loadOrCreateSecret(KEY_FILENAME, () => randomBytes(KEY_BYTES));
  if (cachedKey.length !== KEY_BYTES) {
    // 외부 손상 — fail-fast (silent fallback 금지)
    throw new Error(
      `encryption.key 손상: 예상 ${KEY_BYTES} bytes, 실제 ${cachedKey.length}. ` +
      `~/.winai-publisher/encryption.key 삭제 후 재로그인 필요.`,
    );
  }
  return cachedKey;
}

export interface AccountCredentials {
  hospitalName: string;
  naverId: string;
  naverPw: string;
  blogId: string;
  createdAt: string;
}

interface EncryptedV2 {
  v: 2;
  iv: string; // base64
  authTag: string; // base64
  ciphertext: string; // base64
}

function encryptV2(plain: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // GCM 권장 IV 길이
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload: EncryptedV2 = {
    v: 2,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
  return JSON.stringify(payload);
}

function decryptV2(jsonStr: string): string {
  const payload = JSON.parse(jsonStr) as EncryptedV2;
  if (payload.v !== 2) {
    throw new Error(`unsupported encryption version: ${payload.v}`);
  }
  const key = getEncryptionKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * v1 (legacy CryptoJS) decode. 마이그레이션 전용.
 */
function decryptV1Legacy(encrypted: string): string {
  const decrypted = CryptoJS.AES.decrypt(encrypted, LEGACY_FALLBACK_KEY);
  const text = decrypted.toString(CryptoJS.enc.Utf8);
  if (!text) throw new Error('legacy decrypt produced empty result');
  return text;
}

/**
 * 파일 내용이 v2 JSON 인지 v1 string 인지 판별.
 */
function isV2(raw: string): boolean {
  if (!raw.trim().startsWith('{')) return false;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.v === 2 && typeof parsed.iv === 'string';
  } catch {
    return false;
  }
}

export async function saveCredentials(
  accountId: string,
  creds: AccountCredentials,
): Promise<void> {
  await mkdir(CRED_DIR, { recursive: true });
  const json = JSON.stringify(creds);
  const encrypted = encryptV2(json);
  await writeFile(path.join(CRED_DIR, `account_${accountId}.enc`), encrypted, { mode: 0o600 });
}

export async function getCredentials(accountId: string): Promise<AccountCredentials> {
  const filePath = path.join(CRED_DIR, `account_${accountId}.enc`);
  const raw = await readFile(filePath, 'utf-8');

  if (isV2(raw)) {
    return JSON.parse(decryptV2(raw)) as AccountCredentials;
  }

  // v1 → v2 마이그레이션
  let plain: string;
  try {
    plain = decryptV1Legacy(raw);
  } catch (e) {
    throw new Error(
      `자격증명 마이그레이션 실패 (account_${accountId}): ` +
      `${e instanceof Error ? e.message : String(e)}. 재로그인이 필요합니다.`,
    );
  }
  const parsed = JSON.parse(plain) as AccountCredentials;
  // 새 형식으로 재암호화 후 저장 (idempotent)
  await saveCredentials(accountId, parsed);
  return parsed;
}

export async function deleteCredentials(accountId: string): Promise<void> {
  const filePath = path.join(CRED_DIR, `account_${accountId}.enc`);
  if (existsSync(filePath)) await unlink(filePath);
  const sessionPath = path.join(CRED_DIR, `session_${accountId}.json`);
  if (existsSync(sessionPath)) await unlink(sessionPath);
}

export async function listAccounts(): Promise<
  Array<{ id: string; hospitalName: string; blogId: string }>
> {
  await mkdir(CRED_DIR, { recursive: true });
  const files = await readdir(CRED_DIR);
  const accounts = [];

  for (const file of files) {
    if (file.startsWith('account_') && file.endsWith('.enc')) {
      const id = file.replace('account_', '').replace('.enc', '');
      try {
        const creds = await getCredentials(id);
        accounts.push({ id, hospitalName: creds.hospitalName, blogId: creds.blogId });
      } catch {
        /* 손상된 파일 무시 — 사용자가 재로그인 필요 */
      }
    }
  }
  return accounts;
}
