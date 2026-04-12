/**
 * 서버사이드 Gemini API 직접 호출 유틸리티
 *
 * API 라우트에서 /api/gemini를 self-fetch하면 Vercel 서버리스에서
 * 타임아웃/데드락이 발생하므로, 직접 Gemini API를 호출하는 헬퍼.
 */

function getKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const envName = i === 0 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`;
    const val = process.env[envName];
    if (val) keys.push(val);
  }
  return keys;
}

let keyIndex = 0;

export interface GeminiCallOptions {
  prompt: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  googleSearch?: boolean;
  systemInstruction?: string;
}

export interface GeminiCallResult {
  text: string | null;
  error: string | null;
}

/**
 * 서버사이드에서 Gemini API를 직접 호출합니다.
 * 키 로테이션 + 재시도(최대 2회) 포함.
 */
export async function callGeminiDirect(options: GeminiCallOptions): Promise<GeminiCallResult> {
  const keys = getKeys();
  if (keys.length === 0) {
    return { text: null, error: 'GEMINI_API_KEY 미설정' };
  }

  // 모델 fallback: 요청한 모델 → pro → flash 순으로 시도
  const models = [
    options.model || 'gemini-3.1-flash-lite-preview',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite-preview',
  ];
  // 중복 제거
  const uniqueModels = [...new Set(models)];

  for (const model of uniqueModels) {
  for (let attempt = 0; attempt < Math.min(keys.length, 2); attempt++) {
    const key = keys[(keyIndex + attempt) % keys.length];

    const requestBody: Record<string, unknown> = {
      contents: [{
        role: 'user',
        parts: [{ text: options.prompt }],
      }],
      generationConfig: {
        temperature: options.temperature ?? 0.5,
        maxOutputTokens: options.maxOutputTokens ?? 4096,
      },
    };

    if (options.systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: options.systemInstruction }],
      };
    }

    if (options.googleSearch) {
      requestBody.tools = [{ googleSearch: {} }];
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const status = response.status;
        const errBody = await response.text().catch(() => '');
        console.error(`[GeminiDirect] ${model} 실패: ${status} ${errBody.substring(0, 300)}`);
        if (status === 429 || status === 503) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        if (status === 400 || status === 404) {
          break; // 이 모델 포기, 다음 모델로
        }
        continue;
      }

      keyIndex = ((keyIndex + attempt) % keys.length + 1) % keys.length;

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        return { text, error: null };
      }

      return { text: null, error: '응답에 텍스트 없음' };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return { text: null, error: '타임아웃 (60초)' };
      }
      continue;
    }
  } // end keys loop
  } // end models loop

  // Google Search가 켜져있었다면 끄고 한번 더 시도
  if (options.googleSearch) {
    console.warn('[GeminiDirect] Google Search 모드에서 전부 실패 → Search 없이 재시도');
    return callGeminiDirect({ ...options, googleSearch: false });
  }

  return { text: null, error: '모든 모델/키 시도 실패' };
}
