/**
 * POST /api/video/generate-subtitles
 *
 * Google Cloud Speech-to-Text V2 (Chirp 3) 를 사용하여
 * 업로드된 오디오/비디오에서 자막을 생성하고 의료광고법 위반을 검증한다.
 *
 * 환경변수:
 *   GOOGLE_CLOUD_PROJECT_ID   — GCP 프로젝트 ID
 *   GOOGLE_CLOUD_STT_REGION   — STT 리전 (기본 us-central1)
 *   GOOGLE_APPLICATION_CREDENTIALS — 서비스 계정 키 JSON 경로
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { validateMedicalAd, countViolations, type ViolationResult } from '../../../../lib/medicalAdValidation';
import { generateSrt, type SrtSegment } from '../../../../lib/srtUtils';

export const maxDuration = 300; // 5분 — 오디오 처리에 충분한 시간
export const dynamic = 'force-dynamic';

// ── 치과 용어 Phrase Hints (Speech Adaptation) ──
const DENTAL_PHRASE_HINTS = [
  '임플란트', '지르코니아', '올세라믹', '크라운', '브릿지', '틀니', '레진',
  '인레이', '온레이', '라미네이트', '치주', '스케일링', '발치', '매복', '교정',
  '인비절라인', '클리피씨', '세라믹', '아말감', '근관치료', '신경치료',
  '골이식', '상악동', '가이드수술', '네비게이션', '디지털교합',
];

// ── 타입 ──

interface SubtitleSegment {
  start_time: number;
  end_time: number;
  text: string;
  violations: ViolationResult[];
}

interface GenerateSubtitlesResponse {
  subtitles: SubtitleSegment[];
  total_segments: number;
  total_speech_duration: number;
  high_violation_count: number;
  medium_violation_count: number;
  srt_content: string;
}

export async function POST(request: NextRequest) {
  // ── 게스트 rate limit ──
  const gate = gateGuestRequest(request, 5, '/api/video/generate-subtitles');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    // ── 환경변수 확인 ──
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    if (!projectId) {
      return NextResponse.json(
        { error: 'Google Cloud 프로젝트가 설정되지 않았습니다. 관리자에게 문의하세요.' },
        { status: 503 },
      );
    }

    // ── FormData 파싱 ──
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const subtitleStyle = (formData.get('subtitle_style') as string) || 'highlight';
    const subtitlePosition = (formData.get('subtitle_position') as string) || 'bottom';
    const dentalTerms = formData.get('dental_terms') === 'true';

    if (!file) {
      return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 });
    }

    // 파일 크기 제한 (500MB)
    if (file.size > 500 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기가 500MB를 초과합니다.' }, { status: 400 });
    }

    // ── 오디오 바이트 추출 ──
    const audioBytes = Buffer.from(await file.arrayBuffer());

    // ── Google Cloud STT V2 호출 ──
    const region = process.env.GOOGLE_CLOUD_STT_REGION || 'us-central1';
    const recognizer = `projects/${projectId}/locations/${region}/recognizers/_`;

    // 액세스 토큰 획득 (Application Default Credentials)
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Google Cloud 인증 실패. 서비스 계정을 확인해주세요.' },
        { status: 503 },
      );
    }

    // 파일 크기 체크 — 동기 recognize는 인라인 content ~10MB 제한
    // base64 인코딩하면 33% 커지므로 원본 ~7.5MB가 한계
    const isLargeFile = audioBytes.length > 7 * 1024 * 1024;

    // STT V2 공통 config
    const sttConfig: Record<string, unknown> = {
      languageCodes: ['ko-KR'],
      model: 'chirp_2',
      // autoDecodingConfig: MP3, MP4, WAV 등 압축/컨테이너 포맷 자동 디코딩 (필수!)
      autoDecodingConfig: {},
      features: {
        enableWordTimeOffsets: true,
        enableAutomaticPunctuation: true,
      },
      ...(dentalTerms ? {
        adaptation: {
          phraseSets: [{
            phrases: DENTAL_PHRASE_HINTS.map(phrase => ({ value: phrase, boost: 10 })),
          }],
        },
      } : {}),
    };

    let sttData: {
      results?: Array<{
        alternatives?: Array<{
          transcript?: string;
          words?: Array<{
            word?: string;
            startOffset?: string;
            endOffset?: string;
          }>;
        }>;
      }>;
    };

    if (isLargeFile) {
      // ── 큰 파일: GCS 업로드 없이 longRunningRecognize (inline content 한계 있음) ──
      // 실제로는 GCS에 업로드 후 uri로 참조해야 하지만, 현재는 에러 안내
      return NextResponse.json(
        { error: '파일이 너무 큽니다 (7MB 초과). MP3를 더 짧게 잘라서 시도하거나, 비트레이트를 낮춰주세요.' },
        { status: 400 },
      );
    }

    // ── 동기 recognize (작은 파일) ──
    const sttRequestBody = {
      config: sttConfig,
      content: audioBytes.toString('base64'),
    };

    const sttUrl = `https://${region}-speech.googleapis.com/v2/${recognizer}:recognize`;
    const sttRes = await fetch(sttUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sttRequestBody),
    });

    if (!sttRes.ok) {
      const errBody = await sttRes.text();
      console.error('[generate-subtitles] STT 에러', sttRes.status, errBody);
      // GCP 에러 메시지 파싱해서 사용자에게 보여주기
      let detail = '';
      try {
        const errJson = JSON.parse(errBody);
        detail = errJson.error?.message || '';
      } catch { /* ignore */ }
      return NextResponse.json(
        { error: `음성 인식 실패 (${sttRes.status}). ${detail || '오디오 형식이나 길이를 확인해주세요.'}` },
        { status: 502 },
      );
    }

    sttData = await sttRes.json();

    // ── 결과 파싱 → 자막 세그먼트 생성 ──
    const subtitles: SubtitleSegment[] = [];
    let totalSpeechDuration = 0;

    const results = sttData.results || [];
    for (const result of results) {
      const alt = result.alternatives?.[0];
      if (!alt?.transcript) continue;

      const words = alt.words || [];
      if (words.length === 0) {
        // 단어 타임스탬프가 없는 경우 전체 텍스트로 하나의 세그먼트
        subtitles.push({
          start_time: 0,
          end_time: 0,
          text: alt.transcript,
          violations: validateMedicalAd(alt.transcript),
        });
        continue;
      }

      // 단어들을 문장/구 단위로 묶어서 세그먼트 생성
      // 스타일에 따라 묶는 단위가 다름
      const segments = groupWordsIntoSegments(words, subtitleStyle);
      for (const seg of segments) {
        const violations = validateMedicalAd(seg.text);
        subtitles.push({ ...seg, violations });
        totalSpeechDuration = Math.max(totalSpeechDuration, seg.end_time);
      }
    }

    // ── 위반 통계 ──
    const allViolations = subtitles.flatMap(s => s.violations);
    const counts = countViolations(allViolations);

    // ── SRT 생성 ──
    const srtSegments: SrtSegment[] = subtitles.map(s => ({
      start_time: s.start_time,
      end_time: s.end_time,
      text: s.text,
    }));
    const srtContent = generateSrt(srtSegments);

    // ── 응답 ──
    const response: GenerateSubtitlesResponse = {
      subtitles,
      total_segments: subtitles.length,
      total_speech_duration: Math.round(totalSpeechDuration * 10) / 10,
      high_violation_count: counts.high,
      medium_violation_count: counts.medium,
      srt_content: srtContent,
    };

    return NextResponse.json(response);

  } catch (err) {
    console.error('[generate-subtitles] 서버 에러', err);
    return NextResponse.json(
      { error: '자막 생성 중 서버 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

// ── 헬퍼: 단어 → 세그먼트 그룹핑 ──

function parseSeconds(offset?: string): number {
  if (!offset) return 0;
  // "1.500s" → 1.5
  return parseFloat(offset.replace('s', '')) || 0;
}

function groupWordsIntoSegments(
  words: Array<{ word?: string; startOffset?: string; endOffset?: string }>,
  style: string,
): Array<{ start_time: number; end_time: number; text: string }> {
  const segments: Array<{ start_time: number; end_time: number; text: string }> = [];

  if (style === 'single_line') {
    // 한 문장씩: 마침표/물음표/느낌표 기준 or 일정 단어 수 기준
    let buf: typeof words = [];
    for (const w of words) {
      buf.push(w);
      const text = (w.word || '');
      if (text.match(/[.?!。]$/) || buf.length >= 12) {
        segments.push({
          start_time: parseSeconds(buf[0]?.startOffset),
          end_time: parseSeconds(buf[buf.length - 1]?.endOffset),
          text: buf.map(b => b.word || '').join(' '),
        });
        buf = [];
      }
    }
    if (buf.length > 0) {
      segments.push({
        start_time: parseSeconds(buf[0]?.startOffset),
        end_time: parseSeconds(buf[buf.length - 1]?.endOffset),
        text: buf.map(b => b.word || '').join(' '),
      });
    }
  } else {
    // basic / highlight: 5~8단어씩 묶기 (자연스러운 끊어읽기)
    const chunkSize = style === 'highlight' ? 5 : 8;
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize);
      segments.push({
        start_time: parseSeconds(chunk[0]?.startOffset),
        end_time: parseSeconds(chunk[chunk.length - 1]?.endOffset),
        text: chunk.map(w => w.word || '').join(' '),
      });
    }
  }

  return segments;
}

// ── 헬퍼: GCP 액세스 토큰 획득 ──

async function getAccessToken(): Promise<string | null> {
  try {
    // 1) GOOGLE_APPLICATION_CREDENTIALS 환경변수로 서비스 계정 JSON 경로 → JWT로 토큰 교환
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const credJson = process.env.GOOGLE_CLOUD_CREDENTIALS_JSON; // 또는 JSON 문자열 직접

    let serviceAccount: { client_email: string; private_key: string } | null = null;

    if (credJson) {
      serviceAccount = JSON.parse(credJson);
    } else if (credPath) {
      const fs = await import('fs');
      const raw = fs.readFileSync(credPath, 'utf-8');
      serviceAccount = JSON.parse(raw);
    }

    if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
      console.error('[generate-subtitles] 서비스 계정 정보 없음');
      return null;
    }

    // JWT 생성
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
    };

    const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const unsigned = `${enc(header)}.${enc(payload)}`;

    const crypto = await import('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(unsigned);
    const signature = sign.sign(serviceAccount.private_key, 'base64url');

    const jwt = `${unsigned}.${signature}`;

    // 토큰 교환
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!tokenRes.ok) {
      console.error('[generate-subtitles] 토큰 교환 실패', await tokenRes.text());
      return null;
    }

    const tokenData = await tokenRes.json() as { access_token?: string };
    return tokenData.access_token || null;

  } catch (err) {
    console.error('[generate-subtitles] 인증 에러', err);
    return null;
  }
}
