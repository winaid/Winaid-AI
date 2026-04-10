/**
 * fontStorage — 커스텀 폰트를 IndexedDB에 저장/로드.
 *
 * 이전에는 localStorage에 base64 data URL로 저장했는데:
 *  - 1~4MB 폰트 하나가 5MB 쿼터 거의 다 먹음
 *  - 카드뉴스 드래프트 자동저장(동일 쿼터)과 동시에 실패
 *  - 실패가 silent catch로 사용자에게 안 보임
 *
 * IndexedDB로 이동하면 쿼터가 훨씬 크고(브라우저별 수백MB), 드래프트 저장과
 * 독립적이다. 의존성 최소화를 위해 idb 패키지 없이 raw API 사용.
 *
 * API:
 *   saveFont(name, file)     — File/Blob/ArrayBuffer 저장 (ArrayBuffer로 통일)
 *   loadFont(name)           — ArrayBuffer 반환, 없으면 null
 *   loadFontMeta(name)       — { name, displayName } 반환 (데이터는 아님)
 *   listFonts()              — { name, displayName }[] 나열
 *   deleteFont(name)         — 삭제
 *   getActiveFontName()      — localStorage에 저장된 현재 선택 폰트명
 *   setActiveFontName(name)  — 현재 선택 폰트명 저장 (null이면 삭제)
 *
 * 마이그레이션:
 *   migrateLegacyLocalStorageFont() — 기존 localStorage('winaid_custom_font')에
 *     폰트가 있으면 IndexedDB로 옮기고 localStorage 키 삭제.
 */

const DB_NAME = 'winaid-fonts';
const DB_VERSION = 1;
const STORE = 'fonts';

const LEGACY_KEY = 'winaid_custom_font';
const ACTIVE_NAME_KEY = 'winaid_custom_font_active_name';

export interface StoredFont {
  name: string;
  displayName: string;
  data: ArrayBuffer;
  savedAt: number;
}

export interface FontMeta {
  name: string;
  displayName: string;
  savedAt: number;
}

// ── IndexedDB 핸들 ──

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unsupported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

function txPromise<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = work(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB tx failed'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB tx failed')); };
  }));
}

// ── 공개 API ──

export async function saveFont(name: string, displayName: string, data: ArrayBuffer): Promise<void> {
  const record: StoredFont = { name, displayName, data, savedAt: Date.now() };
  await txPromise('readwrite', store => store.put(record));
}

export async function loadFont(name: string): Promise<StoredFont | null> {
  try {
    const result = await txPromise<StoredFont | undefined>('readonly', store => store.get(name));
    return result ?? null;
  } catch {
    return null;
  }
}

export async function listFonts(): Promise<FontMeta[]> {
  try {
    const all = await txPromise<StoredFont[]>('readonly', store => store.getAll());
    return (all || []).map(f => ({ name: f.name, displayName: f.displayName, savedAt: f.savedAt }));
  } catch {
    return [];
  }
}

export async function deleteFont(name: string): Promise<void> {
  try {
    await txPromise('readwrite', store => store.delete(name));
  } catch { /* noop */ }
}

// ── 활성 폰트명 (localStorage, 경량) ──

export function getActiveFontName(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(ACTIVE_NAME_KEY); } catch { return null; }
}

export function setActiveFontName(name: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (name) localStorage.setItem(ACTIVE_NAME_KEY, name);
    else localStorage.removeItem(ACTIVE_NAME_KEY);
  } catch { /* noop */ }
}

// ── localStorage → IndexedDB 마이그레이션 (1회) ──

/**
 * 기존 localStorage('winaid_custom_font') 에 저장된 폰트가 있으면 IndexedDB로 이관.
 * 성공 시 localStorage 원본 삭제 → 쿼터 해방. 실패는 graceful.
 */
export async function migrateLegacyLocalStorageFont(): Promise<StoredFont | null> {
  if (typeof window === 'undefined') return null;
  let rawJson: string | null = null;
  try { rawJson = localStorage.getItem(LEGACY_KEY); } catch { return null; }
  if (!rawJson) return null;

  try {
    const parsed = JSON.parse(rawJson) as { name: string; displayName: string; data: string };
    if (!parsed.name || !parsed.data) {
      try { localStorage.removeItem(LEGACY_KEY); } catch { /* */ }
      return null;
    }
    // data: data URL → ArrayBuffer
    const res = await fetch(parsed.data);
    const buf = await res.arrayBuffer();
    await saveFont(parsed.name, parsed.displayName || parsed.name, buf);
    setActiveFontName(parsed.name);
    // 성공 → localStorage 원본 해방
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* */ }
    return { name: parsed.name, displayName: parsed.displayName || parsed.name, data: buf, savedAt: Date.now() };
  } catch {
    return null;
  }
}
