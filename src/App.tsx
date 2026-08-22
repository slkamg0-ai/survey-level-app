import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Tabs } from './components/Tabs';
import { TrenchSurveyTab } from './components/TrenchSurveyTab';
import { StandardLevelTab } from './components/StandardLevelTab';
import { JobSessionModal } from './components/JobSessionModal';
import { ManholeDbModal, getSavedManholes } from './components/ManholeDbModal';
import { RouteModal } from './components/RouteModal';
import { NearbyModal } from './components/NearbyModal';
import { loadRoutes, buildSpans, applyManholePick, describeLengthGap } from './utils/routes';
import { TrenchSurveyData, StandardSurveyData, ManholeMasterItem } from './types/survey';
import './styles/index.css';

/** 손상된 저장값이 있어도 렌더가 죽지 않도록 감싼 읽기 */
const readJson = (key: string): any => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export function App() {
  const [activeTab, setActiveTab] = useState<'trench' | 'standard'>('trench');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [secName, setSecName] = useState('구간 미지정');
  const [ihVal, setIhVal] = useState('—');
  const [ihSub, setIhSub] = useState('TBM표고 + 후시');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 모달 상태
  const [isJobsModalOpen, setIsJobsModalOpen] = useState(false);
  const [isMhDbModalOpen, setIsMhDbModalOpen] = useState(false);
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [isNearbyModalOpen, setIsNearbyModalOpen] = useState(false);

  // 로드 콜백 트리거
  const [loadedTrenchData, setLoadedTrenchData] = useState<TrenchSurveyData | null>(null);
  const [loadedStandardData, setLoadedStandardData] = useState<StandardSurveyData | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
    }, 2000);
  };

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  /**
   * 맨홀을 시점/종점으로 넣는다. 연장은 두 맨홀 좌표로 계산해 함께 채우고,
   * 좌표가 없으면 비워서 이전 구간 값이 남아 조용히 틀리는 일을 막는다.
   */
  const pickManhole = (type: 'start' | 'end', item: ManholeMasterItem) => {
    const current = readJson('survey_trench_data_v2');
    const updated = applyManholePick(current, type, item, getSavedManholes());
    localStorage.setItem('survey_trench_data_v2', JSON.stringify(updated));
    setLoadedTrenchData(updated as TrenchSurveyData);

    // 연장이 왜 안 나오는지 어느 쪽 때문인지까지 짚어준다
    const gap = describeLengthGap(updated.startMhName, updated.endMhName, getSavedManholes());
    showToast(
      updated.len
        ? `${item.name} 적용 · 연장 ${updated.len}m (좌표 계산)`
        : `${item.name} 적용 · 연장 계산 불가 — ${gap}`
    );
    return updated;
  };

  const handleUpdateHeader = (name: string, ih: string, sub: string) => {
    setSecName(name);
    setIhVal(ih);
    setIhSub(sub);
  };

  return (
    <div>
      <Header
        secName={secName}
        ihVal={ihVal}
        ihSub={ihSub}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenJobs={() => setIsJobsModalOpen(true)}
        onOpenMhDb={() => setIsMhDbModalOpen(true)}
        onOpenRoutes={() => setIsRouteModalOpen(true)}
        onOpenNearby={() => setIsNearbyModalOpen(true)}
      />

      {activeTab === 'trench' ? (
        <TrenchSurveyTab
          onUpdateHeader={handleUpdateHeader}
          onToast={showToast}
          loadedData={loadedTrenchData}
          onClearLoadedData={() => setLoadedTrenchData(null)}
        />
      ) : (
        <StandardLevelTab
          onUpdateHeader={handleUpdateHeader}
          onToast={showToast}
          loadedData={loadedStandardData}
          onClearLoadedData={() => setLoadedStandardData(null)}
        />
      )}

      <Tabs activeTab={activeTab} onChangeTab={setActiveTab} />

      {/* 작업 세션 저장 및 불러오기 모달 */}
      <JobSessionModal
        isOpen={isJobsModalOpen}
        onClose={() => setIsJobsModalOpen(false)}
        activeTab={activeTab}
        currentTrenchData={readJson('survey_trench_data_v2')}
        currentStandardData={readJson('survey_standard_data_v2')}
        onLoadTrenchData={(data) => {
          setActiveTab('trench');
          setLoadedTrenchData(data);
        }}
        onLoadStandardData={(data) => {
          setActiveTab('standard');
          setLoadedStandardData(data);
        }}
        onToast={showToast}
      />

      {/* CAD 맨홀 관저고 DB 관리자 모달 */}
      <ManholeDbModal
        isOpen={isMhDbModalOpen}
        onClose={() => setIsMhDbModalOpen(false)}
        onToast={showToast}
        onSelectManhole={(type, item) => {
          setActiveTab('trench');
          pickManhole(type, item);
        }}
      />


      {/* 노선 · 다구간 측량 */}
      <RouteModal
        isOpen={isRouteModalOpen}
        onClose={() => setIsRouteModalOpen(false)}
        onToast={showToast}
        onStartSpan={(routeId, spanIndex) => {
          const route = loadRoutes().find(r => r.id === routeId) || null;
          const span = buildSpans(route, getSavedManholes())[spanIndex];
          if (!span) return;

          const current = readJson('survey_trench_data_v2');
          const updated = {
            ...current,
            routeId,
            spanIndex,
            startMhName: span.start.name,
            endMhName: span.end.name,
            secName: `${span.start.name} ~ ${span.end.name}`,
            startInv: span.start.invertEl,
            endInv: span.end.invertEl,
            len: span.length !== null ? span.length.toFixed(2) : (current.len || '')
          };
          localStorage.setItem('survey_trench_data_v2', JSON.stringify(updated));
          setActiveTab('trench');
          setLoadedTrenchData(updated);
        }}
      />

      {/* 내 위치 근처 맨홀 */}
      <NearbyModal
        isOpen={isNearbyModalOpen}
        onClose={() => setIsNearbyModalOpen(false)}
        onToast={showToast}
        onPick={(type, item) => {
          setActiveTab('trench');
          pickManhole(type, item);
        }}
      />

      {/* Floating Toast Notification */}
      <div className={`toast ${toastMsg ? 'show' : ''}`} role="status" aria-live="polite">
        {toastMsg}
      </div>
    </div>
  );
}

export default App;
