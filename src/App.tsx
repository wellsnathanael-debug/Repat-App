import { useEffect, useState } from 'react';
import { getCase, type CaseRecord } from './db';
import { caseCodeFromUrl } from './caseCode';
import StartScreen from './screens/StartScreen';
import SetupScreen from './screens/SetupScreen';
import LoadCaseScreen from './screens/LoadCaseScreen';
import LockScreen from './screens/LockScreen';
import MainScreen from './screens/MainScreen';
import ExportScreen from './screens/ExportScreen';

type Screen = 'loading' | 'start' | 'setup' | 'load' | 'lock' | 'main' | 'export';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null);
  const [urlCode] = useState<string | null>(() => caseCodeFromUrl());

  const refresh = async (unlocked = false) => {
    const record = await getCase();
    setCaseRecord(record ?? null);
    if (!record) setScreen(urlCode ? 'load' : 'start');
    else setScreen(unlocked ? 'main' : 'lock');
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  switch (screen) {
    case 'loading':
      return <div className="loading">Loading…</div>;
    case 'start':
      return <StartScreen onSetup={() => setScreen('setup')} onLoad={() => setScreen('load')} />;
    case 'setup':
      return <SetupScreen onCreated={() => void refresh(true)} onBack={() => setScreen('start')} />;
    case 'load':
      return (
        <LoadCaseScreen
          initialCode={urlCode ?? undefined}
          onLoaded={() => void refresh(true)}
          onBack={() => setScreen('start')}
        />
      );
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
