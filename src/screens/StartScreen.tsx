import { useState } from 'react';
import { createCase, type CaseRecord } from '../db';
import { DEMO_PIN, demoAttachment, demoDetails, demoPrefills } from '../demoData';

export default function StartScreen({
  onSetup,
  onLoad,
  onDemo,
}: {
  onSetup: () => void;
  onLoad: () => void;
  onDemo: (record: CaseRecord) => void;
}) {
  const [busy, setBusy] = useState(false);

  // Quick single-device demo: creates the fictitious demo case directly.
  // This screen only appears when no case exists, so it can never overwrite
  // live case data; the confirm guards against accidental taps.
  const startDemo = async () => {
    if (
      !confirm(
        `Set up a demo case (fictitious patient "${demoDetails.patientName}") on this device? ` +
          `The PIN will be ${DEMO_PIN}.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const report = await demoAttachment();
    const record = await createCase(
      demoDetails,
      DEMO_PIN,
      demoPrefills,
      report ? [report] : undefined,
    );
    onDemo(record);
  };

  return (
    <div className="screen start-screen">
      <header className="app-header">
        <h1>Repatriation Documentation</h1>
        <p className="subtitle">No case is currently on this device</p>
      </header>
      <div className="start-options">
        <button className="start-option" onClick={onLoad}>
          <span className="start-option-title">Load case from code</span>
          <span className="start-option-desc">
            For escorts: enter the case code and PIN provided by the repatriation desk. The
            patient details will appear on this device.
          </span>
        </button>
        <button className="start-option" onClick={onSetup}>
          <span className="start-option-title">Set up a new case</span>
          <span className="start-option-desc">
            For the repatriation desk: enter patient details and set the escort PIN — either
            directly on the escort's device, or to generate a case code to send to them.
          </span>
        </button>
        <button
          className="btn btn-ghost btn-small demo-link"
          onClick={() => void startDemo()}
          disabled={busy}
        >
          {busy ? 'Setting up demo…' : 'Set up a demo case on this device (fake patient)'}
        </button>
      </div>
    </div>
  );
}
