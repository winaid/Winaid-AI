// POST /api/auth/verify — 비밀번호 인증 (비활성화됨)
// Ported from functions/api/auth/verify.js

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  return res.status(410).json({
    success: false,
    error: '비밀번호 인증이 비활성화되었습니다.',
  });
}
