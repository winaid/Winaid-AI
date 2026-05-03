'use client';

import { useState, useEffect } from 'react';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import { useTeamData } from '../../../lib/useTeamData';

const STRENGTHS_KEY = 'winaid_hospital_strengths';

function saveStrengths(hospitalName: string, strengths: string) {
  const data = JSON.parse(localStorage.getItem(STRENGTHS_KEY) || '{}');
  if (strengths.trim()) {
    data[hospitalName] = strengths;
  } else {
    delete data[hospitalName];
  }
  localStorage.setItem(STRENGTHS_KEY, JSON.stringify(data));
}

function getStrengths(hospitalName: string): string {
  const data = JSON.parse(localStorage.getItem(STRENGTHS_KEY) || '{}');
  return data[hospitalName] || '';
}

function getAllStrengths(): Record<string, string> {
  return JSON.parse(localStorage.getItem(STRENGTHS_KEY) || '{}');
}

export default function StrengthsPage() {
  useAuthGuard();
  const { teamData: TEAM_DATA } = useTeamData();

  const [selectedTeam, setSelectedTeam] = useState<number>(1);
  const [hospitalName, setHospitalName] = useState('');
  const [strengths, setStrengths] = useState('');
  const [allStrengths, setAllStrengths] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState('');
  const [editingHospital, setEditingHospital] = useState<string | null>(null);

  useEffect(() => {
    setAllStrengths(getAllStrengths());
  }, []);

  useEffect(() => {
    if (hospitalName) {
      setStrengths(getStrengths(hospitalName));
    }
  }, [hospitalName]);

  const handleSave = () => {
    if (!hospitalName) return;
    saveStrengths(hospitalName, strengths);
    setAllStrengths(getAllStrengths());
    setSaveStatus('저장 완료');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  const handleDelete = (name: string) => {
    if (!confirm(`"${name}"의 특장점을 삭제하시겠습니까?`)) return;
    saveStrengths(name, '');
    setAllStrengths(getAllStrengths());
    if (hospitalName === name) setStrengths('');
  };

  const handleEdit = (name: string) => {
    setHospitalName(name);
    setStrengths(getStrengths(name));
    setEditingHospital(name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const team = TEAM_DATA.find(t => t.id === selectedTeam);
  const inputCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all';

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-6">
      {/* 헤더 */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">💪</span>
          <h1 className="text-xl font-bold text-slate-800">병원 특장점 관리</h1>
        </div>
        <p className="text-sm text-slate-400">병원별 강점을 등록하면 AI가 블로그/카드뉴스/보도자료에 자동 반영합니다</p>
      </div>

      {/* 입력 폼 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        {/* 팀/병원 선택 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">팀</label>
            <select value={selectedTeam} onChange={e => { setSelectedTeam(Number(e.target.value)); setHospitalName(''); }}
              className={inputCls}>
              {TEAM_DATA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">병원</label>
            <select value={hospitalName} onChange={e => setHospitalName(e.target.value)} className={inputCls}>
              <option value="">병원 선택</option>
              {team?.hospitals.map(h => (
                <option key={h.name} value={h.name.replace(/ \(.*\)$/, '')}>{h.name.replace(/ \(.*\)$/, '')}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 특장점 입력 */}
        {hospitalName && (
          <>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                특장점 {editingHospital && <span className="text-blue-500">(수정 중)</span>}
              </label>
              <textarea
                value={strengths}
                onChange={e => setStrengths(e.target.value)}
                placeholder={"예:\n- 원장 경력 20년, 임플란트 1만 건 이상\n- 자체 기공소 보유, 당일 보철 가능\n- 최신 CT/구강스캐너 장비\n- 야간/주말 진료\n- 소아치과 전문 진료실 별도 운영"}
                rows={8}
                className={`${inputCls} resize-none`}
              />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleSave}
                className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all">
                저장
              </button>
              {saveStatus && <span className="text-sm text-emerald-600 font-medium">{saveStatus}</span>}
            </div>
          </>
        )}
      </div>

      {/* 저장된 특장점 목록 */}
      {Object.keys(allStrengths).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
            <span className="text-sm font-bold text-slate-700">등록된 병원 ({Object.keys(allStrengths).length}개)</span>
          </div>
          <div className="divide-y divide-slate-100">
            {Object.entries(allStrengths).map(([name, str]) => (
              <div key={name} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-slate-700">{name}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEdit(name)}
                      className="text-[10px] text-blue-500 hover:text-blue-700">수정</button>
                    <button onClick={() => handleDelete(name)}
                      className="text-[10px] text-red-500 hover:text-red-700">삭제</button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 line-clamp-2 whitespace-pre-wrap">{str}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
