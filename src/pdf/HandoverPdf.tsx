import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { CaseRecord } from '../db';
import type { Answers, FieldDef } from '../schema/types';
import { durationBetween, formatUkUtc } from '../time';
import { BrandBar, LmwhBlock, pdfStyles, RepeatTable } from './common';
import { repatRecord } from '../schema/repatRecord';

// Focused handover letter for the receiving hospital/GP: clinical content
// only — no internal operational checklists.

function Line({ label, value, empty }: { label: string; value?: string; empty?: string }) {
  return (
    <View style={pdfStyles.fieldRow} wrap={false}>
      <Text style={pdfStyles.fieldLabel}>{label}</Text>
      {value?.trim() ? (
        <Text style={pdfStyles.fieldValue}>{value}</Text>
      ) : (
        <Text style={[pdfStyles.fieldValue, pdfStyles.empty]}>{empty ?? 'Not recorded'}</Text>
      )}
    </View>
  );
}

const findField = (id: string): FieldDef => {
  for (const s of repatRecord.sections) {
    const f = s.fields.find((f) => f.id === id);
    if (f) return f;
  }
  throw new Error(`Field ${id} not in repat record schema`);
};

export default function HandoverPdf({
  caseRecord,
  answersByTab,
}: {
  caseRecord: CaseRecord;
  answersByTab: Record<string, Answers>;
}) {
  const assessment = answersByTab['pre-repat-assessment'] ?? {};
  const record = answersByTab['repat-record'] ?? {};
  const hand = answersByTab['handover'] ?? {};

  const destination =
    hand.destinationType?.choice === 'home'
      ? 'Home'
      : hand.destinationType?.choice === 'hospital'
        ? 'Hospital'
        : '';
  const transportTime = durationBetween(record.startOfRepat?.iso, hand.arrivalDateTime?.iso);

  const baselineParts = [
    ['BP', record.baseBP?.text],
    ['HR', record.baseHR?.text],
    ['RR', record.baseRR?.text],
    ['SpO2', record.baseSpO2?.text],
    ['Temp', record.baseTemp?.text],
  ]
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k} ${v!.trim()}`)
    .join(', ');

  return (
    <Document title={`Repatriation handover — ${caseRecord.healixRef}`}>
      <Page size="A4" style={pdfStyles.page}>
        <BrandBar />
        <Text style={pdfStyles.docTitle}>Repatriation handover letter</Text>
        <Text style={pdfStyles.docSubtitle}>
          To the receiving medical team / GP. Times shown as UK time with UTC alongside. Generated{' '}
          {new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC
        </Text>

        <View style={pdfStyles.headerBox}>
          {(
            [
              ['Patient name', caseRecord.patientName],
              ['DOB', caseRecord.dob],
              ['Healix file ref', caseRecord.healixRef],
              ['Medical escort', caseRecord.escortName],
            ] as Array<[string, string]>
          ).map(([label, value]) => (
            <View key={label} style={pdfStyles.headerItem}>
              <Text style={pdfStyles.headerLabel}>{label}</Text>
              <Text style={pdfStyles.headerValue}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle} minPresenceAhead={40}>
            Clinical summary
          </Text>
          <Line label="Diagnosis" value={assessment.diagnosis?.text} />
          <Line label="History and treatment abroad" value={assessment.historyTreatment?.text} />
          <Line label="Allergies" value={assessment.allergies?.text} />
          <Line label="Past medical history" value={assessment.pastMedicalHistory?.text} />
          <Line label="Medications" value={assessment.medsList?.text} />
        </View>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle} minPresenceAhead={40}>
            Transfer
          </Text>
          <Line label="Start of repat" value={formatUkUtc(record.startOfRepat?.iso)} />
          <Line label="Arrival" value={formatUkUtc(hand.arrivalDateTime?.iso)} />
          <Line label="Total transport time" value={transportTime} empty="Not calculated" />
          <Line label="Handed over to" value={destination} />
          <Line label="Destination" value={hand.destinationAddress?.text} />
        </View>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle} minPresenceAhead={40}>
            Observations during transfer
          </Text>
          <Line label="Baseline vital signs" value={baselineParts} />
          <RepeatTable field={findField('vitalsLog')} answers={record} />
        </View>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle} minPresenceAhead={40}>
            Medications given during transfer
          </Text>
          <RepeatTable field={findField('medsGiven')} answers={record} />
          <LmwhBlock field={findField('lmwhGiven')} answers={record} />
        </View>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle} minPresenceAhead={40}>
            Escort summary / handover
          </Text>
          <Text style={{ paddingLeft: 4, lineHeight: 1.5 }}>
            {hand.handoverLetter?.text?.trim() || 'No summary written.'}
          </Text>
        </View>

        <View style={pdfStyles.section} wrap={false}>
          <Line label="Medical escort" value={caseRecord.escortName} />
          <Line
            label="Date"
            value={new Date().toISOString().slice(0, 10)}
          />
        </View>

        <View style={pdfStyles.footer} fixed>
          <Text>
            {caseRecord.healixRef} — {caseRecord.patientName}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
