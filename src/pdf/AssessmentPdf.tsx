import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { CaseRecord } from '../db';
import type { Answers, FieldDef } from '../schema/types';
import { sectionNAKey } from '../schema/types';
import { preRepatAssessment } from '../schema/preRepatAssessment';

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#111' },
  docTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  docSubtitle: { fontSize: 9, color: '#555', marginBottom: 10 },
  headerBox: {
    borderWidth: 1,
    borderColor: '#0f4c81',
    borderRadius: 3,
    padding: 8,
    marginBottom: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  headerItem: { width: '33.3%', marginBottom: 4, paddingRight: 6 },
  headerLabel: { fontSize: 7, color: '#0f4c81', fontFamily: 'Helvetica-Bold' },
  headerValue: { fontSize: 9 },
  section: { marginBottom: 8 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    backgroundColor: '#e8eef5',
    color: '#0f4c81',
    padding: 4,
    marginBottom: 4,
  },
  sectionTitleMajor: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    backgroundColor: '#0f4c81',
    color: '#fff',
    padding: 5,
    marginBottom: 4,
  },
  sectionNA: { fontStyle: 'italic', color: '#555', paddingLeft: 4, marginBottom: 4 },
  fieldRow: { flexDirection: 'row', marginBottom: 3, paddingLeft: 4 },
  fieldLabel: { width: '42%', fontFamily: 'Helvetica-Bold', paddingRight: 6 },
  fieldValue: { width: '58%' },
  note: { fontStyle: 'italic', color: '#555', marginBottom: 4, paddingLeft: 4 },
  naValue: { color: '#777' },
  empty: { color: '#bbb' },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#888',
  },
});

function choiceLabel(choice?: string): string {
  if (choice === 'yes') return 'Yes';
  if (choice === 'no') return 'No';
  if (choice === 'na') return 'N/A';
  return '';
}

function FieldLine({ field, answers }: { field: FieldDef; answers: Answers }) {
  if (field.type === 'note') return <Text style={styles.note}>{field.text}</Text>;

  const value = answers[field.id] ?? {};
  let rendered;
  if (field.type === 'yesNoNA') {
    const label = choiceLabel(value.choice);
    rendered = label ? (
      <Text style={styles.fieldValue}>{label === 'N/A' ? 'N/A' : `[X] ${label}`}</Text>
    ) : (
      <Text style={[styles.fieldValue, styles.empty]}>Not completed</Text>
    );
  } else if (value.na) {
    rendered = <Text style={[styles.fieldValue, styles.naValue]}>N/A</Text>;
  } else if (field.type === 'datetime' && value.text) {
    rendered = <Text style={styles.fieldValue}>{value.text.replace('T', ' ')} UTC</Text>;
  } else if (value.text?.trim()) {
    rendered = <Text style={styles.fieldValue}>{value.text}</Text>;
  } else {
    rendered = <Text style={[styles.fieldValue, styles.empty]}>Not completed</Text>;
  }

  return (
    <View style={styles.fieldRow} wrap={false}>
      <Text style={styles.fieldLabel}>{field.label ?? ''}</Text>
      {rendered}
    </View>
  );
}

export default function AssessmentPdf({
  caseRecord,
  answers,
}: {
  caseRecord: CaseRecord;
  answers: Answers;
}) {
  const tab = preRepatAssessment;
  const header: Array<[string, string]> = [
    ['Patient name', caseRecord.patientName],
    ['DOB', caseRecord.dob],
    ['Home address', caseRecord.homeAddress],
    ['Pax mobile no.', caseRecord.paxMobile],
    ['Healix file ref', caseRecord.healixRef],
    ['Escort name', caseRecord.escortName],
  ];

  return (
    <Document title={`Repatriation documentation — ${caseRecord.healixRef}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.docTitle}>{tab.title}</Text>
        <Text style={styles.docSubtitle}>
          Repatriation documentation — all timings in UTC. Generated{' '}
          {new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC
        </Text>

        <View style={styles.headerBox}>
          {header.map(([label, value]) => (
            <View key={label} style={styles.headerItem}>
              <Text style={styles.headerLabel}>{label}</Text>
              <Text style={styles.headerValue}>{value}</Text>
            </View>
          ))}
        </View>

        {tab.sections.map((section) => {
          const sectionNA = section.sectionNA && answers[sectionNAKey(section.id)]?.na;
          return (
            <View key={section.id} style={styles.section}>
              <Text
                style={section.major ? styles.sectionTitleMajor : styles.sectionTitle}
                minPresenceAhead={40}
              >
                {section.title}
              </Text>
              {sectionNA ? (
                <Text style={styles.sectionNA}>N/A — section not applicable</Text>
              ) : (
                section.fields.map((field) => (
                  <FieldLine key={field.id} field={field} answers={answers} />
                ))
              )}
            </View>
          );
        })}

        <View style={styles.footer} fixed>
          <Text>
            {caseRecord.healixRef} — {caseRecord.patientName}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
