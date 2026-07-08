import { useCallback, useEffect, useRef, useState } from 'react';
import { getMeta, type CaseRecord } from './db';
import { lockSession } from './crypto';
import { caseCodeFromUrl } from './caseCode';
import StartScreen from './screens/StartScreen';
import SetupScreen from './screens/SetupScreen';
import LoadCaseScreen from './screens/LoadCaseScreen';
import LockScreen from './screens/LockScreen';
import MainScreen from './screens/MainScreen';
import ExportScreen from './screens/ExportScreen';

type Screen = 'loading' | 'start' | 'setup' | 'load' | 'lock' | 'main' | 'export';

// Auto-lock after inactivity: the session key is dropped and the PIN is
// required again. Overridable for tests via localStorage 'repat-autolock-s'.
const AUTOLOCK_DEFAULT_S = 15 * 60;

function autolockSeconds(): number {
  const override = Number(localStorage.getItem('repat-autolock-s'));
  return override > 0 ? override : AUTOLOCK_DEFAULT_S;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null);
  const [healixRef, setHealixRef] = useState('');
  const [urlCode] = useState<string | null>(() => caseCodeFromUrl());

  const refresh = async (unlocked?: CaseRecord) => {
    if (unlocked) {
      setCaseRecord(unlocked);
      setHealixRef(unlocked.healixRef);
      setScreen('main');
      return;
    }
    const meta = await getMeta();
    setCaseRecord(null);
    if (!meta) setScreen(urlCode ? 'load' : 'start');
    else {
      setHealixRef(meta.healixRef);
      setScreen('lock');
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inactivity auto-lock.
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const lock = useCallback(() => {
    lockSession();
    setCaseRecord(null);
    setScreen('lock');
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (screenRef.current === 'main' || screenRef.current === 'export') lock();
      }, autolockSeconds() * 1000);
    };
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, arm, { passive: true });
    arm();
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, arm);
    };
  }, [lock]);

  switch (screen) {
    case 'loading':
      return <div className="loading">Loading…</div>;
    case 'start':
      return <StartScreen onSetup={() => setScreen('setup')} onLoad={() => setScreen('load')} />;
    case 'setup':
      return (
        <SetupScreen
          onCreated={(record) => void refresh(record)}
          onBack={() => setScreen('start')}
        />
      );
    case 'load':
      return (
        <LoadCaseScreen
          initialCode={urlCode ?? undefined}
          onLoaded={(record) => void refresh(record)}
          onBack={() => setScreen('start')}
        />
      );
    case 'lock':
      return <LockScreen healixRef={healixRef} onUnlocked={(record) => void refresh(record)} />;
    case 'main':
      return (
        <MainScreen
          caseRecord={caseRecord!}
          onExport={() => setScreen('export')}
          onLock={lock}
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
