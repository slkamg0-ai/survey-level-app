import React from 'react';
import { Pipette, Table2 } from 'lucide-react';

interface TabsProps {
  activeTab: 'trench' | 'standard';
  onChangeTab: (tab: 'trench' | 'standard') => void;
}

export const Tabs: React.FC<TabsProps> = ({ activeTab, onChangeTab }) => {
  return (
    <nav className="nav-tabs">
      <div className="nav-tabs-in">
        <button
          className={`tab-btn ${activeTab === 'trench' ? 'active' : ''}`}
          onClick={() => onChangeTab('trench')}
        >
          <Pipette size={18} />
          관로 터파기 야장
        </button>
        <button
          className={`tab-btn ${activeTab === 'standard' ? 'active' : ''}`}
          onClick={() => onChangeTab('standard')}
        >
          <Table2 size={18} />
          표준 레벨 야장
        </button>
      </div>
    </nav>
  );
};
