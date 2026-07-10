import { useState } from 'react';
import type { CaseRecord } from '../db';
import { tabs } from '../schema/preRepatAssessment';
import FormRenderer from '../components/FormRenderer';
import UploadsTab from './UploadsTab';
import MissionTab from './MissionTab';

export default function MainScreen({
  caseRecord,
  onExport,
  onLock,
}: {
  caseRecord: CaseRecord;
  onExport: () => void;
  onLock: () => void;
}) {
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const activeTab = tabs.find((t) => t.id === activeTabId)!;

  return (
    <div className="screen main-screen">
      <header className="app-header main-header">
        <div>
          <h1>Repatriation Documentation</h1>
          <p className="subtitle">All entries save automatically to this device</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={onLock}>
            Lock
          </button>
          <button className="btn btn-primary" onClick={onExport}>
            Export / Finish
          </button>
        </div>
      </header>

      <div className="patient-banner">
        <div className="patient-banner-grid">
          <div>
            <span className="pb-label">Patient</span>
            <span className="pb-value">{caseRecord.patientName}</span>
          </div>
          <div>
            <span className="pb-label">DOB</span>
            <span className="pb-value">{caseRecord.dob}</span>
          </div>
          <div>
            <span className="pb-label">Home address</span>
            <span className="pb-value">{caseRecord.homeAddress}</span>
          </div>
          <div>
            <span className="pb-label">Pax mobile</span>
            <span className="pb-value">{caseRecord.paxMobile}</span>
          </div>
          <div>
            <span className="pb-label">Healix ref</span>
            <span className="pb-value">{caseRecord.healixRef}</span>
          </div>
          <div>
            <span className="pb-label">Escort</span>
            <span className="pb-value">{caseRecord.escortName}</span>
          </div>
        </div>
      </div>

      <nav className="tab-bar" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTabId}
            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            {tab.shortTitle ?? tab.title}
          </button>
        ))}
      </nav>

      <main className="tab-content">
        {activeTab.placeholder ? (
          <div className="placeholder-panel">
            <h2>{activeTab.title}</h2>
            <p>This section is coming soon.</p>
          </div>
        ) : activeTab.custom === 'uploads' ? (
          <UploadsTab />
        ) : activeTab.custom === 'mission' ? (
          <MissionTab caseRecord={caseRecord} />
        ) : (
          <FormRenderer tab={activeTab} caseRecord={caseRecord} />
        )}
      </main>
    </div>
  );
}
