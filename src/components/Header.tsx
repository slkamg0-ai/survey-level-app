import React from 'react';
import { Sun, Moon, HardHat } from 'lucide-react';

interface HeaderProps {
  secName: string;
  ihVal: string;
  ihSub: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenJobs?: () => void;
  onOpenMhDb?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ secName, ihVal, ihSub, theme, onToggleTheme, onOpenJobs, onOpenMhDb }) => {
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <b>
              <HardHat size={18} className="text-blue-500" />
              측량 레벨 야장
            </b>
            <span>{secName || '구간 미지정'}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="ih">
              <span className="ih-label">기계고 I.H</span>
              <span className="ih-val">{ihVal}</span>
              <span className="ih-sub">{ihSub}</span>
            </div>

            {onOpenMhDb && (
              <button
                onClick={onOpenMhDb}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 600
                }}
                title="맨홀 CAD 관저고 DB"
              >
                🕳️ 맨홀DB
              </button>
            )}

            {onOpenJobs && (
              <button
                onClick={onOpenJobs}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 600
                }}
                title="작업 목록"
              >
                📂 작업
              </button>
            )}

            <button
              onClick={onToggleTheme}
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '8px',
                color: 'var(--ink)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="테마 전환"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>
      <div className="staff-rule"></div>
    </>
  );
};
