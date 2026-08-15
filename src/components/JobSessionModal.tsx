import React, { useState } from 'react';
import { SavedJobSession, TrenchSurveyData, StandardSurveyData } from '../types/survey';
import { Save, FolderOpen, Trash2, X, Plus, Clock, Check, HardHat } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'trench' | 'standard';
  currentTrenchData: TrenchSurveyData;
  currentStandardData: StandardSurveyData;
  onLoadTrenchData: (data: TrenchSurveyData) => void;
  onLoadStandardData: (data: StandardSurveyData) => void;
  onToast: (msg: string) => void;
}

const JOBS_STORAGE_KEY = 'survey_jobs_sessions_v1';

export function getSavedSessions(): SavedJobSession[] {
  try {
    const saved = localStorage.getItem(JOBS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function saveSessionList(sessions: SavedJobSession[]) {
  try {
    localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error(e);
  }
}

export const JobSessionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  activeTab,
  currentTrenchData,
  currentStandardData,
  onLoadTrenchData,
  onLoadStandardData,
  onToast
}) => {
  const [sessions, setSessions] = useState<SavedJobSession[]>(() => getSavedSessions());
  const [jobName, setJobName] = useState('');

  if (!isOpen) return null;

  const handleSaveCurrentJob = () => {
    const defaultName = activeTab === 'trench'
      ? (currentTrenchData.secName || '관로 구역')
      : (currentStandardData.title || '표준 레벨');

    const nameToSave = jobName.trim() || `${defaultName} (${new Date().toLocaleDateString('ko-KR')})`;
    const newId = Date.now().toString();

    const newSession: SavedJobSession = {
      id: newId,
      name: nameToSave,
      tab: activeTab,
      updatedAt: new Date().toLocaleString('ko-KR'),
      trenchData: activeTab === 'trench' ? currentTrenchData : undefined,
      standardData: activeTab === 'standard' ? currentStandardData : undefined
    };

    const updated = [newSession, ...sessions.filter(s => s.name !== nameToSave)];
    setSessions(updated);
    saveSessionList(updated);
    setJobName('');
    onToast(`💾 '${nameToSave}' 작업 저장 완료!`);
  };

  const handleLoadJob = (session: SavedJobSession) => {
    if (session.tab === 'trench' && session.trenchData) {
      onLoadTrenchData(session.trenchData);
      onToast(`📂 '${session.name}' 관로 야장을 불러왔습니다`);
    } else if (session.tab === 'standard' && session.standardData) {
      onLoadStandardData(session.standardData);
      onToast(`📂 '${session.name}' 표준 야장을 불러왔습니다`);
    }
    onClose();
  };

  const handleDeleteJob = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    saveSessionList(updated);
    onToast(`삭제되었습니다: ${name}`);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '0 0 calc(12px + env(safe-area-inset-bottom)) 0'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          maxHeight: '85vh',
          backgroundColor: 'var(--surface)',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          border: '1px solid var(--line)',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--line-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-2)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '15px' }}>
            <FolderOpen size={18} className="text-blue-500" />
            작업 세션 저장 및 불러오기
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-2)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 바디 내용 */}
        <div style={{ padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* 현재 작업 저장 섹션 */}
          <div style={{ background: 'var(--surface-2)', padding: '12px', borderRadius: '10px', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-2)', marginBottom: '8px' }}>
              ➕ 현재 작업 새로 저장하기
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="t-name"
                placeholder={
                  activeTab === 'trench'
                    ? (currentTrenchData.secName || '예: 2026-08-15 MH01~MH02')
                    : (currentStandardData.title || '예: 2026-08-15 수준측량')
                }
                value={jobName}
                onChange={e => setJobName(e.target.value)}
                style={{ flex: 1, height: '40px' }}
              />
              <button
                className="btn primary"
                onClick={handleSaveCurrentJob}
                style={{ height: '40px', padding: '0 14px', minWidth: 'auto', whiteSpace: 'nowrap' }}
              >
                <Save size={16} /> 저장
              </button>
            </div>
          </div>

          {/* 저장된 작업 목록 */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-2)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
              <span>📋 저장된 작업 목록 ({sessions.length}개)</span>
              <span style={{ fontSize: '10.5px', color: 'var(--ink-3)' }}>터치 시 해당 작업 불러오기</span>
            </div>

            {sessions.length === 0 ? (
              <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--ink-3)', fontSize: '13px' }}>
                저장된 작업 세션이 없습니다. 상단에서 현재 작업을 저장해보세요!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sessions.map(s => (
                  <div
                    key={s.id}
                    onClick={() => handleLoadJob(s)}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--line)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'background .15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, paddingRight: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: s.tab === 'trench' ? 'var(--primary-bg)' : 'var(--ok-bg)',
                            color: s.tab === 'trench' ? 'var(--primary)' : 'var(--ok)'
                          }}
                        >
                          {s.tab === 'trench' ? '관로야장' : '표준야장'}
                        </span>
                        <b style={{ fontSize: '14px', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.name}
                        </b>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={11} /> {s.updatedAt}
                      </div>
                    </div>

                    <button
                      onClick={e => handleDeleteJob(s.id, s.name, e)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--ink-3)',
                        padding: '8px',
                        cursor: 'pointer'
                      }}
                      title="삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
