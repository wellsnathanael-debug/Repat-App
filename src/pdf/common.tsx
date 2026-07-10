import { Font, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Answers, FieldDef, SectionDef } from '../schema/types';
import { sectionNAKey } from '../schema/types';
import { durationBetween, formatUkUtc } from '../time';
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import interItalic from '@fontsource/inter/files/inter-latin-400-italic.woff?url';
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff?url';

// Inter is the brand-sanctioned replacement for Neue Montreal in documents;
// swap these registrations for the Neue Montreal files when supplied.
Font.register({
  family: 'Inter',
  fonts: [
    { src: interRegular },
    { src: interItalic, fontStyle: 'italic' },
    { src: interBold, fontWeight: 700 },
  ],
});

// Healix palette matched to the supplied brand book pages (core dark green,
// mid green, light tint). Confirm against official hex codes when available.
export const BRAND = {
  green: '#17362D',
  accent: '#55C374',
  greenSoft: '#DCEBD8',
  ink: '#1B3931',
  muted: '#58685F',
  faint: '#B7C4BA',
};

export const pdfStyles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: 'Inter', color: BRAND.ink },
  brandBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  wordmark: { fontSize: 16, fontFamily: 'Inter', fontWeight: 700, color: BRAND.green },
  wordmarkSub: { fontSize: 8, color: BRAND.muted },
  docTitle: { fontSize: 13, fontFamily: 'Inter', fontWeight: 700, marginBottom: 2, color: BRAND.green },
  docSubtitle: { fontSize: 9, color: BRAND.muted, marginBottom: 10 },
  headerBox: {
    borderWidth: 1,
    borderColor: BRAND.green,
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  headerItem: { width: '33.3%', marginBottom: 4, paddingRight: 6 },
  headerLabel: { fontSize: 7, color: BRAND.green, fontFamily: 'Inter', fontWeight: 700 },
  headerValue: { fontSize: 9 },
  section: { marginBottom: 8 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Inter', fontWeight: 700,
    backgroundColor: BRAND.greenSoft,
    color: BRAND.green,
    padding: 4,
    marginBottom: 4,
  },
  sectionTitleMajor: {
    fontSize: 12,
    fontFamily: 'Inter', fontWeight: 700,
    backgroundColor: BRAND.green,
    color: '#ffffff',
    padding: 5,
    marginBottom: 4,
  },
  sectionNA: { fontStyle: 'italic', color: BRAND.muted, paddingLeft: 4, marginBottom: 4 },
  fieldRow: { flexDirection: 'row', marginBottom: 3, paddingLeft: 4 },
  fieldLabel: { width: '42%', fontFamily: 'Inter', fontWeight: 700, paddingRight: 6 },
  fieldValue: { width: '58%' },
  note: { fontStyle: 'italic', color: BRAND.muted, marginBottom: 4, paddingLeft: 4 },
  naValue: { color: BRAND.muted },
  empty: { color: BRAND.faint },
  table: { marginLeft: 4, marginBottom: 4, borderWidth: 0.5, borderColor: BRAND.faint },
  tableHead: { flexDirection: 'row', backgroundColor: BRAND.greenSoft },
  tableRow: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: BRAND.faint },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, padding: 3, color: BRAND.green },
  td: { fontSize: 8, padding: 3 },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: BRAND.muted,
  },
});

export function choiceLabel(field: FieldDef, choice?: string): string {
  if (!choice) return '';
  if (field.options) return field.options.find((o) => o.key === choice)?.label ?? choice;
  return { yes: 'Yes', no: 'No', na: 'N/A' }[choice] ?? choice;
}

export function RepeatTable({ field, answers }: { field: FieldDef; answers: Answers }) {
  const rows = answers[field.id]?.rows ?? [];
  const columns = field.columns ?? [];
  if (rows.length === 0) {
    return (
      <View style={pdfStyles.fieldRow} wrap={false}>
        <Text style={pdfStyles.fieldLabel}>{field.label ?? field.addLabel ?? ''}</Text>
        <Text style={[pdfStyles.fieldValue, pdfStyles.empty]}>No entries recorded</Text>
      </View>
    );
  }
  const width = `${100 / columns.length}%`;
  return (
    <View style={pdfStyles.table}>
      <View style={pdfStyles.tableHead}>
        {columns.map((c) => (
          <Text key={c.key} style={[pdfStyles.th, { width }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={pdfStyles.tableRow} wrap={false}>
          {columns.map((c) => (
            <Text key={c.key} style={[pdfStyles.td, { width }]}>
              {c.kind === 'timestamp' ? formatUkUtc(row[c.key]) : (row[c.key] ?? '')}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function LmwhBlock({ field, answers }: { field: FieldDef; answers: Answers }) {
  const value = answers[field.id] ?? {};
  const lines: Array<[string, string]> = [];
  if (value.choice === 'yes') {
    lines.push(['LMWH given', 'Yes']);
    lines.push(['Date and time given', formatUkUtc(value.givenIso) || 'Not recorded']);
    lines.push(['Drug and dose', value.drugDose?.trim() || 'Not recorded']);
  } else if (value.choice === 'no') {
    lines.push(['LMWH given', 'No']);
    lines.push(['Reason not given', value.reason?.trim() || 'Not recorded']);
  } else {
    lines.push(['LMWH given', 'NOT COMPLETED']);
  }
  return (
    <>
      {lines.map(([label, text]) => (
        <View key={label} style={pdfStyles.fieldRow} wrap={false}>
          <Text style={pdfStyles.fieldLabel}>{label}</Text>
          <Text style={pdfStyles.fieldValue}>{text}</Text>
        </View>
      ))}
    </>
  );
}

export function FieldLine({
  field,
  answers,
  transport,
}: {
  field: FieldDef;
  answers: Answers;
  /** start/arrival ISO pair for the computed transport-time field. */
  transport?: { startIso?: string; arrivalIso?: string };
}) {
  if (field.type === 'note') return <Text style={pdfStyles.note}>{field.text}</Text>;
  if (field.type === 'repeat') return <RepeatTable field={field} answers={answers} />;
  if (field.type === 'lmwh') return <LmwhBlock field={field} answers={answers} />;
  if (field.type === 'deskSummary') return null; // on-screen share button only

  const value = answers[field.id] ?? {};
  let rendered;
  if (field.type === 'yesNoNA' || field.type === 'choice') {
    const label = choiceLabel(field, value.choice);
    rendered = label ? (
      <Text style={pdfStyles.fieldValue}>{label === 'N/A' ? 'N/A' : `[X] ${label}`}</Text>
    ) : (
      <Text style={[pdfStyles.fieldValue, pdfStyles.empty]}>Not completed</Text>
    );
  } else if (field.type === 'timestamp') {
    rendered = value.iso ? (
      <Text style={pdfStyles.fieldValue}>{formatUkUtc(value.iso)}</Text>
    ) : (
      <Text style={[pdfStyles.fieldValue, pdfStyles.empty]}>Not completed</Text>
    );
  } else if (field.type === 'transportTime') {
    const result = durationBetween(transport?.startIso, transport?.arrivalIso);
    rendered = result ? (
      <Text style={pdfStyles.fieldValue}>{result}</Text>
    ) : (
      <Text style={[pdfStyles.fieldValue, pdfStyles.empty]}>Not calculated</Text>
    );
  } else if (value.na) {
    rendered = <Text style={[pdfStyles.fieldValue, pdfStyles.naValue]}>N/A</Text>;
  } else if (field.type === 'datetime' && value.text) {
    rendered = <Text style={pdfStyles.fieldValue}>{value.text.replace('T', ' ')} UTC</Text>;
  } else if (value.text?.trim()) {
    rendered = <Text style={pdfStyles.fieldValue}>{value.text}</Text>;
  } else {
    rendered = <Text style={[pdfStyles.fieldValue, pdfStyles.empty]}>Not completed</Text>;
  }

  return (
    <View style={pdfStyles.fieldRow} wrap={false}>
      <Text style={pdfStyles.fieldLabel}>{field.label ?? ''}</Text>
      {rendered}
    </View>
  );
}

export function PdfSection({
  section,
  answers,
  transport,
}: {
  section: SectionDef;
  answers: Answers;
  transport?: { startIso?: string; arrivalIso?: string };
}) {
  const sectionNA = section.sectionNA && answers[sectionNAKey(section.id)]?.na;
  return (
    <View style={pdfStyles.section}>
      <Text
        style={section.major ? pdfStyles.sectionTitleMajor : pdfStyles.sectionTitle}
        minPresenceAhead={40}
      >
        {section.title}
      </Text>
      {sectionNA ? (
        <Text style={pdfStyles.sectionNA}>N/A — section not applicable</Text>
      ) : (
        section.fields.map((field) => (
          <FieldLine key={field.id} field={field} answers={answers} transport={transport} />
        ))
      )}
    </View>
  );
}

export function BrandBar() {
  return (
    <View style={pdfStyles.brandBar} fixed={false}>
      <Text style={pdfStyles.wordmark}>Healix</Text>
      <Text style={pdfStyles.wordmarkSub}>Repatriation documentation</Text>
    </View>
  );
}
