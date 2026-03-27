'use client';

import type { UserProfile } from './adminTypes';
import { formatDate } from './adminTypes';
import type { TeamData } from '../../lib/teamData';

export interface AdminUsersTabProps {
  users: UserProfile[];
  usersLoading: boolean;
  userSearch: string;
  setUserSearch: (v: string) => void;
  TEAM_DATA: TeamData[];
  onTeamChange: (userId: string, teamId: number | null) => void;
  onDelete: (userId: string, userName: string) => void;
  onRefresh: () => void;
}

export default function AdminUsersTab({
  users, usersLoading, userSearch, setUserSearch,
  TEAM_DATA, onTeamChange, onDelete, onRefresh,
}: AdminUsersTabProps) {
  const uq = userSearch.trim().toLowerCase();
  const filteredUsers = uq
    ? users.filter(u =>
        (u.full_name?.toLowerCase().includes(uq)) ||
        (u.email?.toLowerCase().includes(uq))
      )
    : users;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-800">가입 사용자 목록</h2>
              <p className="text-xs text-slate-400 mt-0.5">총 {users.length}명{uq && ` · 검색 ${filteredUsers.length}명`}</p>
            </div>
            <input
              type="text"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="이름·이메일 검색"
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg w-44 focus:outline-none focus:border-emerald-400 transition-colors"
            />
          </div>
          <div className="flex gap-2">
            {users.length > 0 && (
              <button
                onClick={() => {
                  const header = '이름,이메일,팀,가입일';
                  const csv = [header, ...users.map(u =>
                    [u.full_name || '', u.email || '', TEAM_DATA.find(t => t.id === u.team_id)?.label || String(u.team_id ?? '미배정'), formatDate(u.created_at)].join(',')
                  )].join('\n');
                  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `winaid_users_${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-1.5 bg-emerald-50 text-emerald-600 font-medium rounded-lg hover:bg-emerald-100 transition-colors text-xs border border-emerald-200"
              >
                CSV 내보내기
              </button>
            )}
            <button
              onClick={onRefresh}
              disabled={usersLoading}
              className="px-3 py-1.5 bg-slate-100 text-slate-600 font-medium rounded-lg hover:bg-slate-200 transition-colors text-xs disabled:opacity-50"
            >
              {usersLoading ? '로딩...' : '새로고침'}
            </button>
          </div>
        </div>
        {usersLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">불러오는 중...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-3xl mb-2 opacity-30">👤</div>
            <p className="text-slate-400 text-sm">{uq ? '검색 결과가 없습니다.' : '가입한 사용자가 없습니다.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filteredUsers.map(user => {
              const team = TEAM_DATA.find(t => t.id === user.team_id);
              return (
                <div key={user.id} className="px-5 py-4 flex items-center gap-4 group">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {user.full_name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 text-sm">{user.full_name || '-'}</span>
                      {team && (
                        <span className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">{team.label}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{user.email}</p>
                  </div>
                  <select
                    value={user.team_id ?? ''}
                    onChange={e => onTeamChange(user.id, e.target.value ? Number(e.target.value) : null)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-blue-400 transition-colors flex-shrink-0"
                  >
                    <option value="">팀 없음</option>
                    {TEAM_DATA.map(t => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                  <div className="text-xs text-slate-400 flex-shrink-0">
                    {formatDate(user.created_at)}
                  </div>
                  <button
                    onClick={() => onDelete(user.id, user.full_name || user.email || '')}
                    className="text-[10px] text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                  >
                    삭제
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
