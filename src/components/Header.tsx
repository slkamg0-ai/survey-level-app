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

export const Header: React.FC<HeaderProps> = ({
  secName,
  ihVal,
  ihSub,
  theme,
  onToggleTheme,
  onOpenJobs,
  onOpenMhDb,
  onOpenRoutes,
  onOpenNearby,
  onOpenMap
}) => {
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          {/* Row 1: Brand Logo & Fast Action Buttons */}
          <div className="topbar-main">
            <div className="brand">
              <b>
                <HardHat size={16} className="text-blue-500" />
                측량 야장
                <span className="brand-ver">{APP_VERSION}</span>
              </b>
            </div>

            <div className="topbar-actions">
              {onOpenMap && (
                <button
                  type="button"
                  className="topbtn"
                  onClick={onOpenMap}
                  title="현장 평면도 지도 뷰어"
                  style={{ background: 'var(--primary-bg)', borderColor: 'var(--primary)' }}
                >
                  <span className="topbtn-ico">🗺️</span>
                  <span className="topbtn-label" style={{ color: 'var(--primary)', fontWeight: 700 }}>도면</span>
                </button>
              )}

              {onOpenMhDb && (
                <button type="button" className="topbtn" onClick={onOpenMhDb} title="맨홀 CAD 관저고 DB">
                  <span className="topbtn-ico">🕳️</span>
                  <span className="topbtn-label">맨홀</span>
                </button>
              )}

              {onOpenNearby && (
                <button type="button" className="topbtn" onClick={onOpenNearby} title="내 위치 근처 맨홀">
                  <span className="topbtn-ico">📍</span>
                  <span className="topbtn-label">위치</span>
                </button>
              )}

              {onOpenRoutes && (
                <button type="button" className="topbtn" onClick={onOpenRoutes} title="노선 · 다구간 측량">
                  <span className="topbtn-ico">🛣️</span>
                  <span className="topbtn-label">노선</span>
                </button>
              )}

              {onOpenJobs && (
                <button type="button" className="topbtn" onClick={onOpenJobs} title="작업 목록">
                  <span className="topbtn-ico">📂</span>
                  <span className="topbtn-label">작업</span>
                </button>
              )}

              <button
                type="button"
                className="topbtn theme-btn"
                onClick={onToggleTheme}
                title="테마 전환"
              >
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </button>
            </div>
          </div>

          {/* Row 2: Section Context & Machine Height (I.H) */}
          <div className="topbar-sub">
            <div className="topbar-sec">
              <span className="sec-tag">구간</span>
              <span className="sec-name" title={secName}>{secName || '구간 미지정'}</span>
            </div>

            <div className="ih">
              <span className="ih-label">기계고 I.H</span>
              <span className="ih-val">{ihVal || '—'}</span>
              {ihSub && <span className="ih-sub">({ihSub})</span>}
            </div>
          </div>
        </div>
      </header>
      <div className="staff-rule"></div>
    </>
  );
};
