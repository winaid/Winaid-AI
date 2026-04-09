import CryptoJS from 'crypto-js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const CRED_DIR = path.join(process.cwd(), 'credentials');

// 암호화 키 — .env 또는 하드코딩 (로컬 앱이므로 OK)
const ENC_KEY = process.env.ENCRYPTION_KEY || 'winai-local-publisher-2026';

export interface AccountCredentials {
  hospitalName: string;
  naverId: string;
  naverPw: string;
  blogId: string;
  createdAt: string;
}

export async function saveCredentials(accountId: string, creds: AccountCredentials): Promise<void> {
  await mkdir(CRED_DIR, { recursive: true });
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(creds), ENC_KEY).toString();
  await writeFile(path.join(CRED_DIR, `account_${accountId}.enc`), encrypted);
}

export async function getCredentials(accountId: string): Promise<AccountCredentials> {
  const filePath = path.join(CRED_DIR, `account_${accountId}.enc`);
  const encrypted = await readFile(filePath, 'utf-8');
  const decrypted = CryptoJS.AES.decrypt(encrypted, ENC_KEY);
  return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
}

export async function deleteCredentials(accountId: string): Promise<void> {
  const { unlink } = await import('fs/promises');
  const filePath = path.join(CRED_DIR, `account_${accountId}.enc`);
  if (existsSync(filePath)) await unlink(filePath);
  // 세션 파일도 삭제
  const sessionPath = path.join(CRED_DIR, `session_${accountId}.json`);
  if (existsSync(sessionPath)) await unlink(sessionPath);
}

export async function listAccounts(): Promise<Array<{ id: string; hospitalName: string; blogId: string }>> {
  await mkdir(CRED_DIR, { recursive: true });
  const { readdir } = await import('fs/promises');
  const files = await readdir(CRED_DIR);
  const accounts = [];

  for (const file of files) {
    if (file.startsWith('account_') && file.endsWith('.enc')) {
      const id = file.replace('account_', '').replace('.enc', '');
      try {
        const creds = await getCredentials(id);
        accounts.push({ id, hospitalName: creds.hospitalName, blogId: creds.blogId });
      } catch { /* 손상된 파일 무시 */ }
    }
  }
  return accounts;
}
