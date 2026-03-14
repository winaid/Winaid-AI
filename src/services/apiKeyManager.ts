/**
 * Gemini API 키 관리 서비스
 * - 다중 API 키 로드 밸런싱
 * - 자동 폴백 (하나가 할당량 초과 시 다른 키 사용)
 * - 키 상태 추적 및 복구
 */

interface ApiKeyStatus {
  key: string;
  isAvailable: boolean;
  failedAt?: number; // 실패 시간 (타임스탬프)
  failCount: number;
}

class ApiKeyManager {
  private keys: ApiKeyStatus[] = [];
  private currentIndex: number = 0;
  private readonly RECOVERY_TIME = 60 * 60 * 1000; // 1시간 후 재시도

  constructor(apiKeys: string[]) {
    this.keys = apiKeys.map(key => ({
      key,
      isAvailable: true,
      failCount: 0,
    }));
  }

  /**
   * 사용 가능한 API 키 가져오기 (로드 밸런싱)
   */
  getAvailableKey(): string | null {
    // 1. 복구 가능한 키 확인 (1시간 경과)
    this.checkRecovery();

    // 2. 사용 가능한 키 찾기
    const availableKeys = this.keys.filter(k => k.isAvailable);
    
    if (availableKeys.length === 0) {
      console.error('❌ 모든 API 키가 사용 불가 상태입니다');
      return null;
    }

    // 3. 라운드 로빈 방식으로 키 선택
    let attempts = 0;
    while (attempts < this.keys.length) {
      const key = this.keys[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.keys.length;
      
      if (key.isAvailable) {
        console.log(`🔑 API 키 선택: ...${key.key.slice(-8)} (실패 횟수: ${key.failCount})`);
        return key.key;
      }
      
      attempts++;
    }

    return null;
  }

  /**
   * API 키 실패 처리
   */
  markKeyAsFailed(failedKey: string, error: any): void {
    const keyStatus = this.keys.find(k => k.key === failedKey);
    
    if (!keyStatus) return;

    // 할당량 초과 에러 확인
    const isQuotaError = 
      error?.message?.includes('quota') ||
      error?.message?.includes('RESOURCE_EXHAUSTED') ||
      error?.status === 429;

    if (isQuotaError) {
      keyStatus.isAvailable = false;
      keyStatus.failedAt = Date.now();
      keyStatus.failCount++;
      
      console.warn(`⚠️ API 키 할당량 초과: ...${failedKey.slice(-8)} (실패 횟수: ${keyStatus.failCount})`);
      console.log(`🔄 다른 API 키로 자동 전환합니다`);
    } else {
      // 일시적 오류는 실패 카운트만 증가
      keyStatus.failCount++;
      console.warn(`⚠️ API 키 일시적 오류: ...${failedKey.slice(-8)}`);
    }
  }

  /**
   * API 키 성공 처리 (실패 카운트 리셋)
   */
  markKeyAsSuccess(successKey: string): void {
    const keyStatus = this.keys.find(k => k.key === successKey);
    
    if (keyStatus && keyStatus.failCount > 0) {
      console.log(`✅ API 키 정상 작동 확인: ...${successKey.slice(-8)}`);
      keyStatus.failCount = 0;
    }
  }

  /**
   * 실패한 키 복구 확인 (1시간 경과 시)
   */
  private checkRecovery(): void {
    const now = Date.now();
    
    this.keys.forEach(key => {
      if (!key.isAvailable && key.failedAt) {
        const timeSinceFailure = now - key.failedAt;
        
        if (timeSinceFailure >= this.RECOVERY_TIME) {
          key.isAvailable = true;
          key.failedAt = undefined;
          console.log(`🔄 API 키 복구: ...${key.key.slice(-8)} (1시간 경과)`);
        }
      }
    });
  }

  /**
   * 모든 키 상태 확인
   */
  getStatus(): { total: number; available: number; failed: number } {
    const available = this.keys.filter(k => k.isAvailable).length;
    const failed = this.keys.filter(k => !k.isAvailable).length;
    
    return {
      total: this.keys.length,
      available,
      failed,
    };
  }

  /**
   * 상세 상태 로그
   */
  logStatus(): void {
    console.log('📊 API 키 상태:');
    this.keys.forEach((key, index) => {
      const status = key.isAvailable ? '✅ 사용 가능' : '❌ 할당량 초과';
      const failInfo = key.failCount > 0 ? ` (실패 ${key.failCount}회)` : '';
      console.log(`  키 ${index + 1}: ...${key.key.slice(-8)} - ${status}${failInfo}`);
    });
  }
}

// 싱글톤 인스턴스
let keyManagerInstance: ApiKeyManager | null = null;

/**
 * API 키 매니저 초기화
 */
export function initializeApiKeyManager(keys: string[]): void {
  if (keys.length === 0) {
    console.warn('⚠️ API 키가 제공되지 않았습니다');
    return;
  }
  
  keyManagerInstance = new ApiKeyManager(keys);
  console.log(`🔐 API 키 매니저 초기화 완료 (총 ${keys.length}개 키)`);
}

/**
 * 사용 가능한 API 키 가져오기
 */
export function getApiKey(): string | null {
  if (!keyManagerInstance) {
    // 프록시 모드에서는 클라이언트에 키가 없는 것이 정상 — warn으로 낮춤
    console.warn('[ApiKeyManager] 초기화되지 않음 (프록시 모드에서는 정상)');
    return null;
  }
  
  return keyManagerInstance.getAvailableKey();
}

/**
 * API 호출 실패 처리
 */
export function handleApiFailure(failedKey: string, error: any): void {
  if (!keyManagerInstance) return;
  keyManagerInstance.markKeyAsFailed(failedKey, error);
}

/**
 * API 호출 성공 처리
 */
export function handleApiSuccess(successKey: string): void {
  if (!keyManagerInstance) return;
  keyManagerInstance.markKeyAsSuccess(successKey);
}

/**
 * API 키 상태 확인
 */
export function getApiKeyStatus() {
  if (!keyManagerInstance) {
    return { total: 0, available: 0, failed: 0 };
  }
  
  return keyManagerInstance.getStatus();
}

/**
 * API 키 상태 로그 출력
 */
export function logApiKeyStatus(): void {
  if (!keyManagerInstance) {
    console.warn('⚠️ API 키 매니저가 초기화되지 않았습니다');
    return;
  }
  
  keyManagerInstance.logStatus();
}

export default ApiKeyManager;
