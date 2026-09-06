import React from 'react';
import { Sun, Moon, HardHat } from 'lucide-react';
import { APP_VERSION } from '../version';

interface HeaderProps {
  secName: string;
  ihVal: string;
  ihSub: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenJobs?: () => void;
  onOpenMhDb?: () => void;
  onOpenRoutes?: () => void;
  onOpenNearby?: () => void;
  onOpenMap?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ secName, ihVal, ihSub, theme, onToggleTheme, onOpenJobs, onOpenMhDb, onOpenRoutes, onOpenNearby, onOpenMap }) => {
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <b>
              <HardHat size={18} className="text-blue-500" />
              측량 야장
              <span style={{ fontSize: '10px', opacity: 0.8, fontWeight: 600, marginLeft: '4px', background: 'var(--primary-bg)', color: 'var(--primary)', padding: '1px 5px', borderRadius: '4px' }}>
                {APP_VERSION}
              </span>
            </b>
            <span>{secName || '구간 미지정'}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="ih">
              <span className="ih-label">기계고 I.H</span>
              <span className="ih-val">{ihVal}</span>
              <span className="ih-sub">{ihSub}</span>
            </div>

            {onOpenMap && (
              <button className="topbtn" onClick={onOpenMap} title="현장 평면도 지도 뷰어" style={{ background: 'var(--primary-bg)', borderColor: 'var(--primary)' }}>
                <span className="topbtn-ico">🗺️</span>
                <span className="topbtn-label" style={{ color: 'var(--primary)', fontWeight: 700 }}>도면지도</span>
              </button>
            )}

            {onOpenMhDb && (
              <button className="topbtn" onClick={onOpenMhDb} title="맨홀 CAD 관저고 DB">
                <span className="topbtn-ico">🕳️</span>
                <span className="topbtn-label">맨홀DB</span>
              </button>
            )}

            {onOpenNearby && (
              <button className="topbtn" onClick={onOpenNearby} title="내 위치 근처 맨홀">
                <span className="topbtn-ico">📍</span>
                <span className="topbtn-label">위치</span>
              </button>
            )}

            {onOpenRoutes && (
              <button className="topbtn" onClick={onOpenRoutes} title="노선 · 다구간 측량">
                <span className="topbtn-ico">🛣️</span>
                <span className="topbtn-label">노선</span>
              </button>
            )}

            {onOpenJobs && (
              <button className="topbtn" onClick={onOpenJobs} title="작업 목록">
                <span className="topbtn-ico">📂</span>
                <span className="topbtn-label">작업</span>
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
