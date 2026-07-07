// Schema types for the form engine. Tabs are defined as data
// (see preRepatAssessment.ts) and rendered by FormRenderer and the
// PDF generator from the same definition.

export type FieldType = 'text' | 'textWithNA' | 'yesNoNA' | 'datetime' | 'note';

export interface FieldDef {
  id: string;
  type: FieldType;
  label?: string;
  /** For 'note' fields: the instruction text to display. */
  text?: string;
  /** Placeholder shown in empty text boxes. */
  placeholder?: string;
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
  /** Placeholder tabs render a "coming soon" panel instead of sections. */
  placeholder?: boolean;
  sections: SectionDef[];
}

/** Value stored per field. */
export interface FieldValue {
  text?: string;
  na?: boolean;
  choice?: 'yes' | 'no' | 'na';
}

/** All answers for a tab, keyed by field id. Section-level N/A is stored
 *  under the key `section:<sectionId>`. */
export type Answers = Record<string, FieldValue>;

export const sectionNAKey = (sectionId: string) => `section:${sectionId}`;
