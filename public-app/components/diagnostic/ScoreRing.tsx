'use client';

import React from 'react';

interface ScoreRingProps {
  score: number;
  size?: number;
  label?: string;
}

/** 원형 점수 게이지 — 인라인 SVG. 차트 라이브러리 미사용. */
export default function ScoreRing({ score, size = 140, label }: ScoreRingProps) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const stroke = Math.max(6, Math.round(size / 12));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - s / 100);
  const color = s >= 75 ? '#10b981' : s >= 50 ? '#f59e0b' : '#ef4444';
  const valueFontSize = Math.round(size / 3.2);
  const labelFontSize = Math.max(10, Math.round(size / 12));

  return (
    <div className="flex flex-col items-center justify-center" style={{ width: size }}>
      <svg width={size} height={size} aria-label={label ? `${label} 점수 ${s}` : `점수 ${s}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e2e8f0"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={valueFontSize}
          fontWeight={800}
          fill="#1e293b"
        >
          {s}
        </text>
      </svg>
      {label && (
        <div
          className="mt-1 text-slate-500 text-center font-semibold"
          style={{ fontSize: labelFontSize }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
