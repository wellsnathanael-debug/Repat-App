// Demo layer for presentations: a clearly fictitious patient so the tool can
// be demonstrated without typing. The mobile number is in Ofcom's reserved
// drama range; the Healix ref is prefixed DEMO; the sample report image is
// watermarked "SAMPLE — NOT A REAL PATIENT".

import type { CaseDetails, CasePrefills, FileInput } from './db';

export const DEMO_PIN = '123456';

export const demoDetails: CaseDetails = {
  patientName: 'Samantha Example',
  dob: '1957-06-21',
  homeAddress: '1 Example Street, Winchester, SO23 1XX, UK',
  paxMobile: '+44 7700 900999',
  healixRef: 'DEMO-2026-0001',
  escortName: 'Demo Escort RN',
  email: 'demo.patient@example.com',
  hospitalName: "St Example's Hospital, Winchester",
};

export const demoPrefills: CasePrefills = {
  diagnosis:
    'Fractured right neck of femur following a fall on 28/06/2026; right total hip replacement 30/06/2026 (uncemented). Post-op day 9.',
  historyTreatment:
    'Admitted to Clínica Ejemplo, Alicante, after a fall on hotel steps. Uncomplicated THR under spinal anaesthesia. Mobilising with a frame from day 2, physio daily. One unit PRBC post-op (Hb 78 → 96). Wound clean, clips out day 10 planned at destination.',
  allergies: 'Penicillin — widespread rash. No other known allergies.',
  pastMedicalHistory:
    'Hypertension. Type 2 diabetes (diet controlled). Osteoarthritis. Left knee replacement 2019.',
  medications:
    'Enoxaparin 40 mg s/c OD\nRamipril 5 mg PO OD\nParacetamol 1 g PO QDS\nCodeine 30 mg PO QDS PRN\nSenna 15 mg PO ON',
};

/** Fetches the bundled watermarked sample report as a case attachment. */
export async function demoAttachment(): Promise<FileInput | null> {
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}demo-report.png`);
    if (!resp.ok) return null;
    return {
      name: 'Sample-discharge-report.png',
      type: 'image/png',
      data: await resp.blob(),
      addedBy: 'desk',
      addedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
