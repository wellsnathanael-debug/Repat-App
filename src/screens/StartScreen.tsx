export default function StartScreen({
  onSetup,
  onLoad,
}: {
  onSetup: () => void;
  onLoad: () => void;
}) {
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
      </div>
    </div>
  );
}
