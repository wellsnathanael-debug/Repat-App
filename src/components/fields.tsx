import type { FieldDef, FieldValue } from '../schema/types';

interface FieldProps {
  field: FieldDef;
  value: FieldValue;
  disabled?: boolean;
  onChange: (value: FieldValue) => void;
}

function AutoGrowTextarea({
  value,
  disabled,
  placeholder,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (text: string) => void;
}) {
  return (
    <textarea
      className="field-textarea"
      rows={2}
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

export function YesNoNAField({ field, value, disabled, onChange }: FieldProps) {
  const options: Array<{ key: 'yes' | 'no' | 'na'; label: string }> = [
    { key: 'yes', label: 'Yes' },
    { key: 'no', label: 'No' },
    { key: 'na', label: 'N/A' },
  ];
  return (
    <div className="field field-choice">
      {field.label && <label className="field-label">{field.label}</label>}
      <div className="choice-group" role="radiogroup" aria-label={field.label}>
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={value.choice === opt.key}
            disabled={disabled}
            className={`choice-btn ${value.choice === opt.key ? 'selected' : ''}`}
            onClick={() =>
              onChange({ ...value, choice: value.choice === opt.key ? undefined : opt.key })
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
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

export function NoteField({ field }: { field: FieldDef }) {
  return <p className="field-note">{field.text}</p>;
}
