import { useEffect, useState } from 'react';
import { getCase, type CaseRecord } from './db';
import SetupScreen from './screens/SetupScreen';
import LockScreen from './screens/LockScreen';
import MainScreen from './screens/MainScreen';
import ExportScreen from './screens/ExportScreen';

type Screen = 'loading' | 'setup' | 'lock' | 'main' | 'export';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null);

  const refresh = async (unlocked = false) => {
    const record = await getCase();
    setCaseRecord(record ?? null);
    if (!record) setScreen('setup');
    else setScreen(unlocked ? 'main' : 'lock');
  };

  useEffect(() => {
    void refresh();
  }, []);

  switch (screen) {
    case 'loading':
      return <div className="loading">Loading…</div>;
    case 'setup':
      return <SetupScreen onCreated={() => void refresh(true)} />;
    case 'lock':
      return <LockScreen caseRecord={caseRecord!} onUnlocked={() => setScreen('main')} />;
    case 'main':
      return (
        <MainScreen
          caseRecord={caseRecord!}
          onExport={() => setScreen('export')}
          onLock={() => setScreen('lock')}
        />
      );
    case 'export':
      return (
        <ExportScreen
          caseRecord={caseRecord!}
          onBack={() => setScreen('main')}
          onCleared={() => void refresh()}
        />
      );
  }
}
