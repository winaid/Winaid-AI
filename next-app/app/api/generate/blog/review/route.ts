/**
 * POST /api/generate/blog/review (next-app 내부용) — Phase 2A v4 감수 (Opus 4.6)
 *
 * public-app 버전과 동일. guestRateLimit → apiAuth.checkAuth 로 교체만.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../../lib/apiAuth';
import { useCredit } from '../../../../../lib/creditService';
import { buildBlogReviewPrompt } from '../../../../../lib/blogPrompt';
import { applyContentFilters } from '../../../../../lib/medicalLawFilter';
import { callLLM } from '../../../../../lib/llm';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

interface ReviewIssue {
  category: 'medical_law' | 'factuality' | 'tone' | 'seo' | 'structure' | 'ai_artifact';
  severity: 'low' | 'medium' | 'high';
  originalQuote?: string;
  problem?: string;
  suggestion?: string;
}

interface ReviewJson {
  verdict: 'pass' | 'minor_fix' | 'major_fix';
  issues?: ReviewIssue[];
  revisedHtml?: string | null;
  summaryNote?: string;
}

interface Body {
  draftHtml?: string;
  category?: string;
  hospitalName?: string;
  ruleFilterViolations?: string[];
  userId?: string | null;
}

function tryParseJson(raw: string): ReviewJson | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as ReviewJson; } catch { /* pass */ }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try { return JSON.parse(fence[1]) as ReviewJson; } catch { /* pass */ }
  }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try { return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as ReviewJson; } catch { /* pass */ }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  let body: Body;
  try { body = (await request.json()) as Body; } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const draftHtml = body.draftHtml;
  if (!draftHtml || typeof draftHtml !== 'string') {
    return NextResponse.json({ error: 'bad_request', details: 'draftHtml required' }, { status: 400 });
  }

  const userId = body.userId || null;
  if (userId) {
    const credit = await useCredit(userId);
    if (!credit.success) {
      return NextResponse.json({ error: 'insufficient_credits', remaining: credit.remaining }, { status: 402 });
    }
  }

  const { systemBlocks, userPrompt } = buildBlogReviewPrompt(draftHtml, {
    category: body.category,
    hospitalName: body.hospitalName,
    ruleFilterViolations: body.ruleFilterViolations,
  });

  let rawText = '';
  let usage: unknown = null;
  let model = '';
  try {
    const resp = await callLLM({
      task: 'blog_review',
      systemBlocks,
      userPrompt,
      temperature: 0.2,
      maxOutputTokens: 4096,
      userId,
    });
    rawText = resp.text;
    usage = resp.usage;
    model = resp.model;
  } catch (err) {
    const message = (err as Error).message || 'unknown';
    console.error(`[generate/blog/review] callLLM failed: ${message}`);
    return NextResponse.json({
      verdict: 'pass',
      issues: [],
      revisedHtml: null,
      summaryNote: 'review_call_failed_passthrough',
      usage: null,
      model: '',
      warning: `review_failed: ${message.slice(0, 200)}`,
    });
  }

  const parsed = tryParseJson(rawText);
  let verdict: 'pass' | 'minor_fix' | 'major_fix';
  let issues: ReviewIssue[];
  let revisedHtml: string | null;
  let summaryNote: string;

  if (!parsed) {
    verdict = 'pass';
    issues = [];
    revisedHtml = null;
    summaryNote = 'parse_failed_passthrough';
  } else {
    verdict = parsed.verdict === 'minor_fix' || parsed.verdict === 'major_fix' ? parsed.verdict : 'pass';
    issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 5) : [];
    revisedHtml = (verdict !== 'pass' && typeof parsed.revisedHtml === 'string') ? parsed.revisedHtml : null;
    summaryNote = typeof parsed.summaryNote === 'string' ? parsed.summaryNote.slice(0, 400) : '';
    if (verdict === 'pass') { issues = []; revisedHtml = null; }
  }

  if (revisedHtml) {
    const filtered = applyContentFilters(revisedHtml);
    revisedHtml = filtered.filtered;
  }

  const ruleViolations = body.ruleFilterViolations || [];
  if (verdict === 'pass' && ruleViolations.length > 0) {
    const filtered = applyContentFilters(draftHtml);
    if (filtered.replacedCount > 0) {
      verdict = 'minor_fix';
      revisedHtml = filtered.filtered;
      const promotedIssue: ReviewIssue = {
        category: 'medical_law',
        severity: 'low',
        problem: `규칙 필터로 자동 치환된 표현이 ${filtered.replacedCount}건 있습니다 (${ruleViolations.slice(0, 3).join(', ')}${ruleViolations.length > 3 ? ' 등' : ''}).`,
        suggestion: '자동 치환된 안전 표현을 유지하거나 필요 시 수동 교정하세요.',
      };
      issues = [promotedIssue, ...issues].slice(0, 5);
      summaryNote = summaryNote
        ? `${summaryNote} | 서버 안전망이 ${filtered.replacedCount}건 자동 치환.`
        : `서버 안전망이 ${filtered.replacedCount}건 자동 치환.`;
    }
  }

  return NextResponse.json({ verdict, issues, revisedHtml, summaryNote, usage, model });
}
