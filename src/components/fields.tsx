import { useEffect, useState } from 'react';
import type { FieldDef, FieldValue, RepeatRow } from '../schema/types';
import { formatUkUtc, isoToUkInput, nowIso, ukInputToIso, durationBetween } from '../time';
import { getAnswers } from '../db';

interface FieldProps {
  field: FieldDef;
  value: FieldValue;
  disabled?: boolean;
  onChange: (value: FieldValue) => void;
  /** Options for 'drug' columns: desk meds list + kit bag. */
  drugOptions?: string[];
}

function AutoGrowTextarea({
  value,
  disabled,
  placeholder,
  tall,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  tall?: boolean;
  onChange: (text: string) => void;
}) {
  return (
    <textarea
      className={`field-textarea ${tall ? 'tall' : ''}`}
      rows={tall ? 8 : 2}
      value={value}
      disabled={disabled}
      placeholder={disabled ? '' : placeholder}
      onChange={(e) => onChange(e.target.value)}
      onInput={(e) => {
        const el = e.currentTarget;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
      }}
    />
  );
}

export function TextField({ field, value, disabled, onChange }: FieldProps) {
  return (
    <div className="field">
      {field.label && <label className="field-label">{field.label}</label>}
      <AutoGrowTextarea
        value={value.text ?? ''}
        disabled={disabled}
        placeholder={field.placeholder}
        tall={field.tall}
        onChange={(text) => onChange({ ...value, text })}
      />
    </div>
  );
}

export function TextWithNAField({ field, value, disabled, onChange }: FieldProps) {
  const na = value.na ?? false;
  return (
    <div className="field">
      <div className="field-label-row">
        {field.label && <label className="field-label">{field.label}</label>}
        <label className={`na-toggle ${na ? 'checked' : ''}`}>
          <input
            type="checkbox"
            checked={na}
            disabled={disabled}
            onChange={(e) =>
              // Ticking N/A blanks the text box, as specified.
              onChange(e.target.checked ? { na: true, text: '' } : { na: false, text: '' })
            }
          />
          N/A
        </label>
      </div>
      <AutoGrowTextarea
        value={na ? '' : (value.text ?? '')}
        disabled={disabled || na}
        placeholder={field.placeholder}
        onChange={(text) => onChange({ ...value, text })}
      />
    </div>
  );
}

function ChoiceButtons({
  options,
  selected,
  disabled,
  ariaLabel,
  onSelect,
}: {
  options: Array<{ key: string; label: string }>;
  selected?: string;
  disabled?: boolean;
  ariaLabel?: string;
  onSelect: (key: string | undefined) => void;
}) {
  return (
    <div className="choice-group" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          role="radio"
          aria-checked={selected === opt.key}
          disabled={disabled}
          className={`choice-btn ${selected === opt.key ? 'selected' : ''}`}
          onClick={() => onSelect(selected === opt.key ? undefined : opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const YES_NO_NA = [
  { key: 'yes', label: 'Yes' },
  { key: 'no', label: 'No' },
  { key: 'na', label: 'N/A' },
];

export function YesNoNAField({ field, value, disabled, onChange }: FieldProps) {
  return (
    <div className="field field-choice">
      {field.label && <label className="field-label">{field.label}</label>}
      <ChoiceButtons
        options={YES_NO_NA}
        selected={value.choice}
        disabled={disabled}
        ariaLabel={field.label}
        onSelect={(choice) => onChange({ ...value, choice })}
      />
    </div>
  );
}

export function ChoiceField({ field, value, disabled, onChange }: FieldProps) {
  return (
    <div className="field field-choice">
      {field.label && <label className="field-label">{field.label}</label>}
      <ChoiceButtons
        options={field.options ?? []}
        selected={value.choice}
        disabled={disabled}
        ariaLabel={field.label}
        onSelect={(choice) => onChange({ ...value, choice })}
      />
    </div>
  );
}

export function DateTimeField({ field, value, disabled, onChange }: FieldProps) {
  return (
    <div className="field">
      {field.label && <label className="field-label">{field.label}</label>}
      <input
        type="datetime-local"
        className="field-input"
        value={value.text ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
      />
      <div className="field-hint">Enter date and time in UTC</div>
    </div>
  );
}

/** Auto-stamping timestamp: "Set to now" records the current moment; the
 *  value displays as UK time with UTC alongside and is manually editable
 *  (entered as UK wall-clock time). Stored as ISO UTC. */
export function TimestampField({ field, value, disabled, onChange }: FieldProps) {
  return (
    <div className="field">
      {field.label && <label className="field-label">{field.label}</label>}
      <div className="timestamp-row">
        <button
          type="button"
          className="btn btn-secondary btn-small"
          disabled={disabled}
          onClick={() => onChange({ ...value, iso: nowIso() })}
        >
          Set to now
        </button>
        <input
          type="datetime-local"
          className="field-input timestamp-input"
          value={isoToUkInput(value.iso)}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, iso: ukInputToIso(e.target.value) })}
        />
        <span className="field-hint">UK time</span>
      </div>
      {value.iso && <div className="timestamp-display">{formatUkUtc(value.iso)}</div>}
    </div>
  );
}

export function RepeatField({ field, value, disabled, onChange, drugOptions }: FieldProps) {
  const rows = value.rows ?? [];
  const columns = field.columns ?? [];

  const updateRow = (index: number, key: string, cell: string) => {
    const next = rows.map((row, i) => (i === index ? { ...row, [key]: cell } : row));
    onChange({ ...value, rows: next });
  };

  const addRow = () => {
    const row: RepeatRow = {};
    for (const col of columns) if (col.kind === 'timestamp') row[col.key] = nowIso();
    onChange({ ...value, rows: [...rows, row] });
  };

  const removeRow = (index: number) => {
    onChange({ ...value, rows: rows.filter((_, i) => i !== index) });
  };

  return (
    <div className="field">
      {field.label && <label className="field-label">{field.label}</label>}
      {rows.map((row, i) => (
        <div className="repeat-row" key={i}>
          <div className="repeat-row-head">
            <span className="repeat-row-num">#{i + 1}</span>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              disabled={disabled}
              onClick={() => removeRow(i)}
            >
              Remove
            </button>
          </div>
          <div className="repeat-grid">
            {columns.map((col) => (
              <div className={`repeat-cell ${col.wide ? 'wide' : ''}`} key={col.key}>
                <label className="repeat-cell-label">{col.label}</label>
                {col.kind === 'timestamp' ? (
                  <>
                    <input
                      type="datetime-local"
                      className="field-input"
                      value={isoToUkInput(row[col.key])}
                      disabled={disabled}
                      onChange={(e) => updateRow(i, col.key, ukInputToIso(e.target.value))}
                    />
                    {row[col.key] && (
                      <div className="timestamp-display">{formatUkUtc(row[col.key])}</div>
                    )}
                  </>
                ) : col.kind === 'drug' ? (
                  <input
                    type="text"
                    className="field-input"
                    list="drug-options"
                    value={row[col.key] ?? ''}
                    disabled={disabled}
                    onChange={(e) => updateRow(i, col.key, e.target.value)}
                  />
                ) : (
                  <input
                    type="text"
                    className="field-input"
                    value={row[col.key] ?? ''}
                    disabled={disabled}
                    onChange={(e) => updateRow(i, col.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {drugOptions && drugOptions.length > 0 && (
        <datalist id="drug-options">
          {drugOptions.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      )}
      <button type="button" className="btn btn-secondary" disabled={disabled} onClick={addRow}>
        + {field.addLabel ?? 'Add entry'}
      </button>
    </div>
  );
}

/** LMWH — mandatory. Yes → time given + drug & dose. No → reason required. */
export function LmwhField({ field, value, disabled, onChange }: FieldProps) {
  const choice = value.choice;
  return (
    <div className="field lmwh-field">
      {field.label && <label className="field-label">{field.label}</label>}
      <ChoiceButtons
        options={[
          { key: 'yes', label: 'Yes' },
          { key: 'no', label: 'No' },
        ]}
        selected={choice}
        disabled={disabled}
        ariaLabel={field.label}
        onSelect={(c) => onChange({ ...value, choice: c })}
      />
      {choice === 'yes' && (
        <div className="lmwh-details">
          <div className="field">
            <label className="field-label">Date and time given *</label>
            <div className="timestamp-row">
              <button
                type="button"
                className="btn btn-secondary btn-small"
                disabled={disabled}
                onClick={() => onChange({ ...value, givenIso: nowIso() })}
              >
                Set to now
              </button>
              <input
                type="datetime-local"
                className="field-input timestamp-input"
                value={isoToUkInput(value.givenIso)}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, givenIso: ukInputToIso(e.target.value) })}
              />
              <span className="field-hint">UK time</span>
            </div>
            {value.givenIso && <div className="timestamp-display">{formatUkUtc(value.givenIso)}</div>}
          </div>
          <div className="field">
            <label className="field-label">Drug and dose given *</label>
            <AutoGrowTextarea
              value={value.drugDose ?? ''}
              disabled={disabled}
              placeholder="e.g. Enoxaparin 40 mg s/c"
              onChange={(drugDose) => onChange({ ...value, drugDose })}
            />
          </div>
        </div>
      )}
      {choice === 'no' && (
        <div className="lmwh-details">
          <div className="field">
            <label className="field-label">Reason LMWH not given *</label>
            <AutoGrowTextarea
              value={value.reason ?? ''}
              disabled={disabled}
              placeholder="e.g. already anticoagulated on apixaban / ambulant short transfer / contraindicated because…"
              onChange={(reason) => onChange({ ...value, reason })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Whether the mandatory LMWH field is complete (also used by the export gate). */
export function lmwhComplete(value: FieldValue | undefined): boolean {
  if (!value?.choice) return false;
  if (value.choice === 'yes') return !!value.givenIso && !!value.drugDose?.trim();
  return !!value.reason?.trim();
}

/** Total transport time — computed from "Start of repat" (Repat record tab)
 *  to "Arrival date and time" on this tab. */
export function TransportTimeField({
  field,
  arrivalIso,
}: {
  field: FieldDef;
  arrivalIso?: string;
}) {
  const [startIso, setStartIso] = useState<string | undefined>();
  useEffect(() => {
    getAnswers('repat-record').then((a) => setStartIso(a.startOfRepat?.iso));
  }, [arrivalIso]);

  const result = durationBetween(startIso, arrivalIso);
  return (
    <div className="field">
      {field.label && <label className="field-label">{field.label}</label>}
      <div className="computed-value" data-testid="transport-time">
        {result ||
          (startIso
            ? 'Set the arrival time above to calculate'
            : 'Set "Start of repat" on the Repat record tab and the arrival time above to calculate')}
      </div>
      <div className="field-hint">Calculated automatically: start of repat → arrival</div>
    </div>
  );
}

export function NoteField({ field }: { field: FieldDef }) {
  return <p className="field-note">{field.text}</p>;
}
