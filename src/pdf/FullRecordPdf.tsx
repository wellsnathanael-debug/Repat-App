import { Document, Image, Page, Text, View } from '@react-pdf/renderer';
import type { CaseRecord } from '../db';
import type { Answers } from '../schema/types';
import { tabs } from '../schema/preRepatAssessment';
import { BrandBar, PdfSection, pdfStyles } from './common';

export interface UploadSummary {
  name: string;
  type: string;
  addedBy: string;
  /** data URL for images, embedded at the end of the record. */
  dataUrl?: string;
}

// The complete repat record for the repatriation desk / case file: every tab
// in full, plus the list of uploaded reports (images embedded).

export default function FullRecordPdf({
  caseRecord,
  answersByTab,
  uploads,
}: {
  caseRecord: CaseRecord;
  answersByTab: Record<string, Answers>;
  uploads: UploadSummary[];
}) {
  const header: Array<[string, string]> = [
    ['Patient name', caseRecord.patientName],
    ['DOB', caseRecord.dob],
    ['Home address', caseRecord.homeAddress],
    ['Pax mobile no.', caseRecord.paxMobile],
    ['Healix file ref', caseRecord.healixRef],
    ['Escort name', caseRecord.escortName],
    ['Email', caseRecord.email || '—'],
    ['Destination hospital', caseRecord.hospitalName || '—'],
  ];

  const transport = {
    startIso: answersByTab['repat-record']?.startOfRepat?.iso,
    arrivalIso: answersByTab['handover']?.arrivalDateTime?.iso,
  };

  return (
    <Document title={`Repatriation record — ${caseRecord.healixRef}`}>
      <Page size="A4" style={pdfStyles.page}>
        <BrandBar />
        <Text style={pdfStyles.docTitle}>Full repatriation record</Text>
        <Text style={pdfStyles.docSubtitle}>
          Times shown as UK time with UTC alongside. Generated{' '}
          {new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC
        </Text>

        <View style={pdfStyles.headerBox}>
          {header.map(([label, value]) => (
            <View key={label} style={pdfStyles.headerItem}>
              <Text style={pdfStyles.headerLabel}>{label}</Text>
              <Text style={pdfStyles.headerValue}>{value}</Text>
            </View>
          ))}
        </View>

        {tabs
          .filter((tab) => !tab.custom && !tab.placeholder)
          .map((tab) => (
            <View key={tab.id}>
              <Text style={pdfStyles.sectionTitleMajor} minPresenceAhead={40}>
                {tab.title}
              </Text>
              {tab.sections.map((section) => (
                <PdfSection
                  key={section.id}
                  section={section}
                  answers={answersByTab[tab.id] ?? {}}
                  transport={transport}
                />
              ))}
            </View>
          ))}

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitleMajor} minPresenceAhead={40}>
            Medical reports / Uploads
          </Text>
          {uploads.length === 0 ? (
            <Text style={pdfStyles.note}>No reports attached to this case.</Text>
          ) : (
            uploads.map((u, i) => (
              <View key={i} style={pdfStyles.fieldRow} wrap={false}>
                <Text style={pdfStyles.fieldLabel}>{u.name}</Text>
                <Text style={pdfStyles.fieldValue}>
                  {u.type} — added by {u.addedBy}
                  {!u.dataUrl && !u.type.startsWith('image/')
                    ? ' (file attached to the case, not embeddable in PDF — share separately)'
                    : ''}
                </Text>
              </View>
            ))
          )}
          {uploads
            .filter((u) => u.dataUrl)
            .map((u, i) => (
              <View key={`img-${i}`} style={{ marginTop: 6 }} wrap={false}>
                <Text style={pdfStyles.note}>{u.name}</Text>
                <Image src={u.dataUrl!} style={{ maxWidth: 480, maxHeight: 600 }} />
              </View>
            ))}
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
