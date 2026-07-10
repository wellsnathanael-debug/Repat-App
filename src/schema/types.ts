// Schema types for the form engine. Tabs are defined as data
// (see preRepatAssessment.ts, repatRecord.ts, handover.ts) and rendered by
// FormRenderer and the PDF generators from the same definition.

export type FieldType =
  | 'text'
  | 'textWithNA'
  | 'yesNoNA'
  | 'datetime'
  | 'timestamp'
  | 'choice'
  | 'repeat'
  | 'lmwh'
  | 'transportTime'
  | 'deskSummary'
  | 'note';

export type RepeatColumnKind = 'text' | 'timestamp' | 'drug';

export interface RepeatColumn {
  key: string;
  label: string;
  kind: RepeatColumnKind;
  /** Wider column for free text (notes). */
  wide?: boolean;
}

export interface FieldDef {
  id: string;
  type: FieldType;
  label?: string;
  /** For 'note' fields: the instruction text to display. */
  text?: string;
  /** Placeholder shown in empty text boxes. */
  placeholder?: string;
  /** For 'choice': the selectable options. */
  options?: Array<{ key: string; label: string }>;
  /** For 'repeat': the columns of each row. */
  columns?: RepeatColumn[];
  /** For 'repeat': label of the add button, e.g. "Add vital signs". */
  addLabel?: string;
  /** Larger text box (handover letter, event log). */
  tall?: boolean;
  /** Seed the value from a case-record field the first time the tab opens. */
  seedFrom?: 'homeAddress' | 'paxMobile' | 'email' | 'hospitalName';
}

export interface SectionDef {
  id: string;
  title: string;
  /** Larger visual weight, e.g. "Assessment at origin". */
  major?: boolean;
  /** Section-level N/A: ticking it clears and disables every field in the section. */
  sectionNA?: boolean;
  fields: FieldDef[];
}

export interface TabDef {
  id: string;
  title: string;
  /** Short label for the tab bar (falls back to title). */
  shortTitle?: string;
  /** Placeholder tabs render a "coming soon" panel instead of sections. */
  placeholder?: boolean;
  /** Custom-rendered tabs (e.g. uploads) handled outside the form engine. */
  custom?: 'uploads' | 'mission';
  sections: SectionDef[];
}

/** One row of a 'repeat' field, keyed by column key. */
export type RepeatRow = Record<string, string>;

/** Value stored per field. */
export interface FieldValue {
  text?: string;
  na?: boolean;
  choice?: string;
  /** For 'timestamp': ISO 8601 UTC. */
  iso?: string;
  /** For 'repeat': the rows. */
  rows?: RepeatRow[];
  /** For 'lmwh': details when choice is 'yes'. */
  givenIso?: string;
  drugDose?: string;
  /** For 'lmwh': mandatory reason when choice is 'no'. */
  reason?: string;
}

/** All answers for a tab, keyed by field id. Section-level N/A is stored
 *  under the key `section:<sectionId>`. */
export type Answers = Record<string, FieldValue>;

export const sectionNAKey = (sectionId: string) => `section:${sectionId}`;
