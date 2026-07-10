import { chromium } from 'playwright-core';
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SHOT = process.env.SHOT_DIR ?? '.';
const BASE = 'http://localhost:4173/Repat-App/';
const results = [];
const check = (name, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) process.exitCode = 1;
};

// Usage: start `npm run preview -- --port 4173`, then `node e2e-check.mjs`.
// Set CHROME_PATH if Chromium is not on Playwright's default search path.
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1024, height: 1366 } }); // iPad-ish
const page = await context.newPage();

// ============ Part A: same-device flow with desk pre-fill ============
await page.goto(BASE);
await page.waitForSelector('text=No case is currently on this device');
check('Start screen shown on first launch', true);
await page.click('.start-option:has-text("Set up a new case")');
await page.waitForSelector('text=New case setup');

await page.fill('#patientName', 'Jane Elizabeth Doe');
await page.fill('#dob', '1958-03-14');
await page.fill('#homeAddress', '12 Harbour Road, Bristol, BS1 4QD, UK');
await page.fill('#paxMobile', '+44 7700 900123');
await page.fill('#healixRef', 'HLX-2026-04821');
await page.fill('#escortName', 'Nathanael Wells RN');
await page.fill('#email', 'jane.doe@example.com');
await page.fill('#hospitalName', 'Bristol Royal Infirmary');
// Desk pre-fills clinical details
await page.fill('#clin-diagnosis', 'Left total hip replacement following fall; post-op day 9.');
await page.fill('#clin-allergies', 'Penicillin — rash.');
await page.fill('#clin-medications', 'Apixaban 5 mg PO BD\nCo-codamol 30/500 PO QDS PRN');
await page.fill('#clin-patientLocation', 'Clínica Ejemplo, Alicante — Ward 4');
// Escort travel details; mismatched emails must be rejected
await page.fill('#escortEmail', 'escort@example.org');
await page.fill('#escortEmailConfirm', 'escrot@example.org');
await page.fill('#flightItinerary', '12 Jul BA423 ALC-LHR dep 10:35');
await page.fill('#hotelDetails', 'Hotel Ejemplo, Alicante, ref HTL-1');
await page.fill('#pin', '482137');
await page.fill('#pinConfirm', '482137');
await page.click('button:has-text("Save case on this device")');
await page.waitForSelector('text=do not match');
check('Mismatched escort emails rejected', true);
await page.fill('#escortEmailConfirm', 'escort@example.org');
await page.screenshot({ path: `${SHOT}/1-setup.png`, fullPage: true });
await page.click('button:has-text("Save case on this device")');

await page.waitForSelector('.patient-banner');
// Mission details tab is the landing tab: itinerary + hotel visible
const missionText = await page.textContent('.tab-content');
check(
  'Mission details tab shows itinerary and hotel',
  missionText.includes('BA423') && missionText.includes('Hotel Ejemplo'),
);
await page.click('.tab:has-text("Pre-repat assessment")');
const banner = await page.textContent('.patient-banner');
check('Patient details auto-populate banner', banner.includes('Jane Elizabeth Doe') && banner.includes('HLX-2026-04821'));

// At-rest encryption: nothing patient-identifiable readable in IndexedDB.
const idbDump = await page.evaluate(async () => {
  const idb = await new Promise((res) => {
    const req = indexedDB.open('repat-app');
    req.onsuccess = () => res(req.result);
  });
  const parts = [];
  for (const store of Array.from(idb.objectStoreNames)) {
    const rows = await new Promise((res) => {
      const r = idb.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => res(r.result);
    });
    parts.push(
      JSON.stringify(rows, (_k, v) => {
        if (v instanceof ArrayBuffer) v = new Uint8Array(v);
        if (ArrayBuffer.isView(v)) return String.fromCharCode(...new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
        return v;
      }),
    );
  }
  return parts.join('|');
});
check(
  'No plaintext patient data at rest in IndexedDB',
  !idbDump.includes('Jane') &&
    !idbDump.includes('Harbour Road') &&
    !idbDump.includes('Apixaban') &&
    !idbDump.includes('BA423'),
);

// Lock / unlock round-trip
await page.click('button:has-text("Lock")');
await page.waitForSelector('#unlock-pin');
const lockText = await page.textContent('body');
check(
  'Lock screen shows case ref but no patient details',
  lockText.includes('HLX-2026-04821') && !lockText.includes('Jane'),
);
await page.fill('#unlock-pin', '999999');
await page.click('button:has-text("Unlock")');
await page.waitForSelector('text=Incorrect PIN');
check('Wrong PIN rejected', true);
await page.fill('#unlock-pin', '482137');
await page.click('button:has-text("Unlock")');
await page.waitForSelector('.patient-banner');
check('Correct PIN unlocks (decryption-verified)', true);
await page.click('.tab:has-text("Pre-repat assessment")');

// Desk pre-fill appears in the assessment tab
const locPrefill = await page
  .locator('section:has(h2:text-is("Patient location")) textarea')
  .inputValue();
check('Patient location entered by the desk pre-fills the assessment', locPrefill.includes('Ward 4'));
const diagPrefill = await page.locator('section:has(h2:text-is("Diagnosis")) textarea').inputValue();
const medsPrefill = await page
  .locator('section:has(h2:text-is("Medications list (Drug name/route/dosage/frequency)")) .field:has(label:text-is("Medications list")) textarea')
  .inputValue();
check(
  'Desk clinical details pre-fill the assessment (editable)',
  diagPrefill.includes('hip replacement') && medsPrefill.includes('Apixaban'),
);

// N/A tick blanks and disables its text box
const coughField = page.locator('section:has(h2:text-is("Respiratory")) .field:has(label:text-is("Cough/respiratory symptoms"))');
await coughField.locator('textarea').fill('to be blanked');
await coughField.locator('.na-toggle input').check();
check(
  'N/A tick blanks and disables field',
  (await coughField.locator('textarea').inputValue()) === '' &&
    (await coughField.locator('textarea').isDisabled()),
);

// Yes/No/NA + section-level N/A
const passports = page.locator('.field:has(label:text-is("Does the patient / travel companion(s) have their passports"))');
await passports.locator('button:text-is("Yes")').click();
check('Yes/No/NA selection', (await passports.locator('button.selected').textContent()) === 'Yes');

const admitted = page.locator('section:has(h2:text-is("If still admitted overseas"))');
await admitted.locator('.section-na input').check();
check(
  'Section N/A blanks and disables all child fields',
  await admitted.locator('button:text-is("Yes")').first().isDisabled(),
);

// Post-assessment confirmation to repat desk
const deskConfirm = page.locator('section:has(h2:has-text("Post-assessment confirmation"))');
await deskConfirm.locator('.field:has(label:has-text("Fit to fly")) button:text-is("Yes")').click();
await deskConfirm
  .locator('.field:has(label:has-text("overseas (to airport)")) button:text-is("Ambulance")')
  .click();
await deskConfirm
  .locator('.field:has(label:has-text("at destination (from airport)")) button:text-is("Car")')
  .click();
await deskConfirm.locator('.field:has(label:has-text("How much luggage")) textarea').fill('2 large cases + 1 cabin bag');
await deskConfirm
  .locator('.field:has(label:has-text("Who arranges")) button:has-text("Repat desk")')
  .click();
await deskConfirm
  .locator('.field:has(label:has-text("destination confirmed")) button:text-is("Hospital")')
  .click();
await deskConfirm
  .locator('.field:has(label:has-text("rationale for admission")) textarea')
  .fill('Needs ongoing IV antibiotics and physio; not safe for home yet.');
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
await deskConfirm.locator('button:has-text("Share summary with repat desk")').click();
await page.waitForSelector('text=copied to clipboard');
const summary = await page.evaluate(() => navigator.clipboard.readText());
check(
  'Desk confirmation summary shares FTF, transport, destination and rationale',
  summary.includes('HLX-2026-04821') &&
    summary.includes('Fit to fly as planned: Yes') &&
    summary.includes('overseas: Ambulance') &&
    summary.includes('at destination: Car') &&
    summary.includes('repat desk to arrange') &&
    summary.includes('Destination confirmed: Hospital') &&
    summary.includes('IV antibiotics'),
);

// ============ Repat record tab ============
await page.click('.tab:has-text("Repat record")');
await page.waitForSelector('h2:text-is("Start of repat")');
const startSection = page.locator('section:has(h2:text-is("Start of repat"))');
await startSection.locator('button:has-text("Set to now")').click();
const startDisplay = await startSection.locator('.timestamp-display').textContent();
check('Start of repat auto-stamps in UK time with UTC', /UK \(\d{2}:\d{2} UTC\)/.test(startDisplay ?? ''));

// Baseline vitals
const baseline = page.locator('section:has(h2:text-is("Baseline vital signs"))');
await baseline.locator('button:has-text("Set to now")').click();
await baseline.locator('.field:has(label:text-is("BP")) textarea').fill('128/76');
await baseline.locator('.field:has(label:text-is("HR")) textarea').fill('72');

// Vitals log: two entries
const vitals = page.locator('section:has(h2:text-is("Vital signs during repat"))');
await vitals.locator('button:has-text("Add vital signs entry")').click();
await vitals.locator('.repeat-row').nth(0).locator('.repeat-cell:has(label:text-is("BP")) input').fill('130/80');
await vitals.locator('button:has-text("Add vital signs entry")').click();
await vitals.locator('.repeat-row').nth(1).locator('.repeat-cell:has(label:text-is("BP")) input').fill('125/78');
const vitalsStamps = await vitals.locator('.timestamp-display').count();
check('Multiple vitals entries with auto timestamps', (await vitals.locator('.repeat-row').count()) === 2 && vitalsStamps >= 2);

// Medications given: dropdown offers desk meds + kit bag
const meds = page.locator('section:has(h2:text-is("Medications given"))');
await meds.locator('button:has-text("Add medication given")').click();
const optionValues = await page.locator('#drug-options option').evaluateAll((opts) => opts.map((o) => o.value));
check(
  'Drug dropdown contains desk medications and kit bag items',
  optionValues.some((v) => v.includes('Apixaban')) && optionValues.some((v) => v.includes('Paracetamol')),
);
await meds.locator('.repeat-row .repeat-cell:has(label:text-is("Drug")) input').fill('Paracetamol 500 mg tablets');
await meds.locator('.repeat-row .repeat-cell:has(label:text-is("Dose/route")) input').fill('1 g PO');
await page.screenshot({ path: `${SHOT}/2-repat-record.png`, fullPage: false });

// ============ LMWH mandatory gate ============
await page.click('button:has-text("Export / Finish")');
await page.waitForSelector('text=Export & finish');
await page.click('button:has-text("Full repat record (desk)")');
await page.waitForSelector('text=mandatory');
check('Export blocked while LMWH incomplete', true);
await page.click('button:has-text("Back to form")');
await page.click('.tab:has-text("Repat record")');
const lmwh = page.locator('section:has(h2:has-text("Low molecular weight heparin"))');
await lmwh.locator('button:text-is("No")').click();
await lmwh.locator('.field:has(label:has-text("Reason LMWH not given")) textarea').fill('Already anticoagulated on apixaban.');
check('LMWH No requires and accepts a reason', true);

// ============ Handover tab ============
await page.click('.tab:has-text("Handover at destination")');
await page.waitForSelector('h2:text-is("Destination")');
const contactTel = await page.locator('.field:has(label:text-is("Home/mobile tel no.")) textarea').inputValue();
const contactEmail = await page.locator('.field:has(label:text-is("Email address")) textarea').inputValue();
check(
  'Handover contacts seeded from case',
  contactTel.includes('7700 900123') && contactEmail.includes('jane.doe@'),
  `tel="${contactTel}" email="${contactEmail}"`,
);

await page.locator('.field:has(label:text-is("Patient handed over to")) button:text-is("Home")').click();
const destAddress = await page.locator('.field:has(label:has-text("Hospital name / home address")) textarea').inputValue();
check('Choosing Home fills the address from the case (overridable)', destAddress.includes('Harbour Road'));

const arrival = page.locator('section:has(h2:text-is("Arrival"))');
await arrival.locator('button:has-text("Set to now")').click();
const transport = await page.locator('[data-testid="transport-time"]').textContent();
check('Total transport time auto-calculates', /\d+ h \d+ m/.test(transport ?? ''), transport ?? '');
await page.fill('.field:has(label:has-text("Summary / handover letter")) textarea', 'Uneventful transfer. Patient stable throughout. Continue apixaban; hip precautions.');
await page.screenshot({ path: `${SHOT}/3-handover.png`, fullPage: true });

// ============ Dual PDF export ============
await page.click('button:has-text("Export / Finish")');
await page.waitForSelector('text=Export & finish');
// On plain static hosting there is no case repository — the submit section must be hidden.
await page.waitForTimeout(500);
check(
  'Repository submission hidden when no repository is hosted',
  !(await page.isVisible('text=Submit to desk repository')),
);
let dl = page.waitForEvent('download', { timeout: 30000 });
await page.click('button:has-text("Full repat record (desk)")');
const fullPdf = await dl;
await fullPdf.saveAs(`${SHOT}/${fullPdf.suggestedFilename()}`);
check('Full repat record PDF exported', fullPdf.suggestedFilename().startsWith('Repat_'), fullPdf.suggestedFilename());

dl = page.waitForEvent('download', { timeout: 30000 });
await page.click('button:has-text("Handover letter (receiving team)")');
const handoverPdf = await dl;
await handoverPdf.saveAs(`${SHOT}/${handoverPdf.suggestedFilename()}`);
check('Handover letter PDF exported', handoverPdf.suggestedFilename().startsWith('Handover_'), handoverPdf.suggestedFilename());

// ============ Transfer case to a second escort device ============
await page.fill('#transfer-pin', '111111');
await page.click('button:has-text("Create transfer file")');
await page.waitForSelector('text=Incorrect PIN — enter this case');
check('Transfer file requires the correct case PIN', true);
await page.fill('#transfer-pin', '482137');
dl = page.waitForEvent('download', { timeout: 30000 });
await page.click('button:has-text("Create transfer file")');
const transferFile = await dl;
const transferPath = `${SHOT}/${transferFile.suggestedFilename()}`;
await transferFile.saveAs(transferPath);
check('Transfer file created', transferFile.suggestedFilename().endsWith('_transfer.repat'));

// ============ Clear case ============
await page.click('button:has-text("Clear case…")');
await page.click('button:has-text("Yes, delete everything")');
await page.waitForSelector('text=No case is currently on this device');
await page.reload();
await page.waitForSelector('text=No case is currently on this device');
check('Clear case wipes data; app ready for next case', true);

// ============ Offline ============
const swReady = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return !!reg.active;
});
check('Service worker active', swReady);
await context.setOffline(true);
await page.reload();
await page.waitForSelector('text=No case is currently on this device', { timeout: 15000 });
check('App loads fully offline', true);
await context.setOffline(false);

// ============ Part B: remote handoff with attached report ============
// Desk generates an encrypted .repat case file including a medical report.
await page.click('.start-option:has-text("Set up a new case")');
await page.fill('#patientName', 'Robert Smith');
await page.fill('#dob', '1949-11-02');
await page.fill('#homeAddress', '3 Mill Lane, Leeds, LS1 2AB, UK');
await page.fill('#paxMobile', '+44 7700 900456');
await page.fill('#healixRef', 'HLX-2026-05512');
await page.fill('#escortName', 'A. Escort RN');
await page.fill('#clin-diagnosis', 'STEMI, primary PCI to LAD.');
await page.fill('#escortEmail', 'escort2@example.org');
await page.fill('#escortEmailConfirm', 'escort2@example.org');
await page.fill('#flightItinerary', '14 Jul VY1240 ALC-BCN dep 09:10');
await page.fill('#pin', '731905');
await page.fill('#pinConfirm', '731905');
// Attach a small "report" (1x1 PNG) and a travel document
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
writeFileSync(`${SHOT}/angiogram-report.png`, pngBytes);
writeFileSync(`${SHOT}/flight-booking.png`, pngBytes);
await page.setInputFiles('#attachments', `${SHOT}/angiogram-report.png`);
await page.setInputFiles('#travel-docs', `${SHOT}/flight-booking.png`);
await page.click('button:has-text("Generate case code for escort")');
await page.waitForSelector('text=Case file ready');

// Email-to-escort: mailto pre-filled with the address, never containing the PIN
const mailHref = (await page.getAttribute('[data-testid="email-escort"]', 'href')) ?? '';
check(
  'Email-to-escort mailto is pre-filled and excludes the PIN',
  mailHref.startsWith('mailto:escort2%40example.org') && !mailHref.includes('731905'),
);
dl = page.waitForEvent('download', { timeout: 30000 });
await page.click('button:has-text("Download Repat_")');
const caseFile = await dl;
const caseFilePath = `${SHOT}/${caseFile.suggestedFilename()}`;
await caseFile.saveAs(caseFilePath);
check('Desk downloads encrypted .repat case file (attachments included)', caseFile.suggestedFilename().endsWith('.repat'));
await page.click('button:has-text("Done")');
await page.reload();
await page.waitForSelector('text=No case is currently on this device');
check('Generating a case file saves nothing on the desk device', true);

// Escort imports the case file on a fresh device.
const escortContext = await browser.newContext({ viewport: { width: 1024, height: 1366 } });
const escortPage = await escortContext.newPage();
await escortPage.goto(BASE);
await escortPage.click('.start-option:has-text("Load case from code")');

// A genuine non-case file (the PNG report) must give the specific
// "doesn't look like a case file" error, not a wrong-PIN error.
await escortPage.setInputFiles('#case-file', `${SHOT}/angiogram-report.png`);
await escortPage.waitForSelector('text=doesn’t look like a case file');
check('Non-case file rejected with a specific error', true);

// A .repat file renamed to .pdf (a predictable desk mistake) must still load
// — renaming doesn't change the contents.
const renamedPath = caseFilePath.replace(/\.repat$/, '-renamed.pdf');
copyFileSync(caseFilePath, renamedPath);
await escortPage.setInputFiles('#case-file', renamedPath);
await escortPage.waitForSelector('text=Loaded:');
check('Case file renamed to .pdf still accepted', true);

await escortPage.fill('#load-pin', '999999');
await escortPage.click('button:has-text("Load case")');
await escortPage.waitForSelector('text=Could not load the case');
check('Wrong PIN cannot decrypt the case file', true);
await escortPage.fill('#load-pin', '731905');
await escortPage.click('button:has-text("Load case")');
await escortPage.waitForSelector('.patient-banner');
const escortBanner = await escortPage.textContent('.patient-banner');
check(
  'Escort loads case file with PIN; details auto-populate',
  escortBanner.includes('Robert Smith') && escortBanner.includes('HLX-2026-05512'),
);
// Landing tab is Mission details: itinerary + travel document visible
await escortPage.waitForSelector('h2:text-is("Travel documents")');
const escortMission = await escortPage.textContent('.tab-content');
check(
  'Mission details tab shows itinerary and travel document on the escort device',
  escortMission.includes('VY1240') && escortMission.includes('flight-booking.png'),
);
await escortPage.click('.tab:has-text("Pre-repat assessment")');
const escortDiag = await escortPage.locator('section:has(h2:text-is("Diagnosis")) textarea').inputValue();
check('Clinical pre-fill travels inside the case file', escortDiag.includes('STEMI'));
await escortPage.click('.tab:has-text("Medical reports / Uploads")');
await escortPage.waitForSelector('.file-list');
const fileList = await escortPage.textContent('.file-list');
check('Attached report appears in the Uploads tab', fileList.includes('angiogram-report.png'));
await escortPage.screenshot({ path: `${SHOT}/4-uploads.png`, fullPage: false });
await escortContext.close();

// ============ #case= link still pre-fills (no-attachment path) ============
const linkContext = await browser.newContext({ viewport: { width: 1024, height: 1366 } });
const linkPage = await linkContext.newPage();
await linkPage.goto(`${BASE}#case=RPT1.notarealcode`);
await linkPage.waitForSelector('#case-code');
check('Case link opens the load screen with the code pre-filled', (await linkPage.locator('#case-code').inputValue()) === 'RPT1.notarealcode');
await linkContext.close();

// ============ Part C: transfer round-trip on a second escort device ============
const secondEscort = await browser.newContext({ viewport: { width: 1024, height: 1366 } });
const secondPage = await secondEscort.newPage();
await secondPage.goto(BASE);
await secondPage.click('.start-option:has-text("Load case from code")');
await secondPage.setInputFiles('#case-file', transferPath);
await secondPage.fill('#load-pin', '482137');
await secondPage.click('button:has-text("Load case")');
await secondPage.waitForSelector('.patient-banner');
const secondBanner = await secondPage.textContent('.patient-banner');
await secondPage.click('.tab:has-text("Repat record")');
await secondPage.waitForSelector('h2:text-is("Start of repat")');
const vitalsRows = await secondPage
  .locator('section:has(h2:text-is("Vital signs during repat")) .repeat-row')
  .count();
const lmwhReason = await secondPage
  .locator('section:has(h2:has-text("Low molecular weight heparin")) .field:has(label:has-text("Reason LMWH not given")) textarea')
  .inputValue();
check(
  'Transfer round-trip: second device continues with all entries',
  secondBanner.includes('Jane Elizabeth Doe') && vitalsRows === 2 && lmwhReason.includes('apixaban'),
  `vitalsRows=${vitalsRows}`,
);
await secondEscort.close();

// ============ Part D: PIN attempt lockout ============
const lockoutContext = await browser.newContext({ viewport: { width: 1024, height: 1366 } });
const lockoutPage = await lockoutContext.newPage();
await lockoutPage.goto(BASE);
await lockoutPage.click('.start-option:has-text("Set up a new case")');
await lockoutPage.fill('#patientName', 'L T');
await lockoutPage.fill('#dob', '1990-01-01');
await lockoutPage.fill('#homeAddress', 'A');
await lockoutPage.fill('#paxMobile', '1');
await lockoutPage.fill('#healixRef', 'HLX-LOCK');
await lockoutPage.fill('#escortName', 'E');
await lockoutPage.fill('#pin', '482137');
await lockoutPage.fill('#pinConfirm', '482137');
await lockoutPage.click('button:has-text("Save case on this device")');
await lockoutPage.waitForSelector('.patient-banner');
await lockoutPage.click('button:has-text("Lock")');
for (let i = 0; i < 5; i++) {
  await lockoutPage.fill('#unlock-pin', '999999');
  await lockoutPage.click('button:has-text("Unlock")');
  await lockoutPage.waitForSelector('.error');
}
const lockoutMsg = await lockoutPage.textContent('.error');
check('5 wrong PINs trigger an escalating lockout', /Too many incorrect attempts/.test(lockoutMsg ?? ''), lockoutMsg ?? '');
// Even the correct PIN is refused while locked out.
await lockoutPage.fill('#unlock-pin', '482137');
await lockoutPage.click('button:has-text("Unlock")');
await lockoutPage.waitForSelector('text=Too many incorrect attempts');
check('Correct PIN also refused during lockout window', true);
await lockoutContext.close();

// ============ Part F: demo layer ============
const demoContext = await browser.newContext({ viewport: { width: 1024, height: 1366 } });
const demoPage = await demoContext.newPage();
await demoPage.goto(BASE);
// Setup-screen fill button
await demoPage.click('.start-option:has-text("Set up a new case")');
await demoPage.click('button:has-text("Fill with demo patient")');
await demoPage.waitForSelector('text=Demo PIN: 123456');
const demoName = await demoPage.locator('#patientName').inputValue();
const demoDiag = await demoPage.locator('#clin-diagnosis').inputValue();
const demoFiles = await demoPage.textContent('.file-list');
check(
  'Demo fill populates setup with fake patient, clinicals and sample report',
  demoName === 'Samantha Example' && demoDiag.includes('femur') && demoFiles.includes('Sample-discharge-report'),
);
await demoPage.click('button:has-text("Back")');
// Start-screen one-tap demo case
demoPage.on('dialog', (d) => void d.accept());
await demoPage.click('button:has-text("Set up a demo case on this device")');
await demoPage.waitForSelector('.patient-banner');
const demoBanner = await demoPage.textContent('.patient-banner');
await demoPage.click('.tab:has-text("Medical reports / Uploads")');
await demoPage.waitForSelector('.file-list');
const demoUploads = await demoPage.textContent('.file-list');
check(
  'One-tap demo case lands on escort view with sample report',
  demoBanner.includes('Samantha Example') && demoBanner.includes('DEMO-2026-0001') && demoUploads.includes('Sample-discharge-report'),
);
const demoDiagField = await demoPage
  .locator('.tab:has-text("Pre-repat assessment")')
  .click()
  .then(() => demoPage.locator('section:has(h2:text-is("Diagnosis")) textarea').inputValue());
check('Demo clinical details pre-fill the assessment', demoDiagField.includes('femur'));
await demoContext.close();

// ============ Part E: auto-lock after inactivity ============
const autoContext = await browser.newContext({ viewport: { width: 1024, height: 1366 } });
await autoContext.addInitScript(() => localStorage.setItem('repat-autolock-s', '2'));
const autoPage = await autoContext.newPage();
await autoPage.goto(BASE);
await autoPage.click('.start-option:has-text("Set up a new case")');
await autoPage.fill('#patientName', 'A T');
await autoPage.fill('#dob', '1990-01-01');
await autoPage.fill('#homeAddress', 'A');
await autoPage.fill('#paxMobile', '1');
await autoPage.fill('#healixRef', 'HLX-AUTO');
await autoPage.fill('#escortName', 'E');
await autoPage.fill('#pin', '482137');
await autoPage.fill('#pinConfirm', '482137');
await autoPage.click('button:has-text("Save case on this device")');
await autoPage.waitForSelector('.patient-banner');
await autoPage.waitForSelector('#unlock-pin', { timeout: 10000 });
check('Auto-lock engages after inactivity', true);
await autoContext.close();

// ============ Part G: case repository server (Docker deployment path) ============
const repoData = mkdtempSync(join(tmpdir(), 'repat-repo-'));
const DESK_TOKEN = 'test-desk-token';
const repoProc = spawn('node', ['server/repo-server.mjs'], {
  env: { ...process.env, PORT: '4180', DESK_TOKEN, DATA_DIR: repoData, DIST_DIR: 'dist' },
  stdio: 'inherit',
});
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch('http://localhost:4180/api/health');
    if (r.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const repoContext = await browser.newContext({ viewport: { width: 1024, height: 1366 } });
const repoPage = await repoContext.newPage();
await repoPage.goto('http://localhost:4180/Repat-App/');
await repoPage.click('.start-option:has-text("Set up a new case")');
await repoPage.fill('#patientName', 'Repo Test Patient');
await repoPage.fill('#dob', '1970-05-05');
await repoPage.fill('#homeAddress', '9 Repo Road');
await repoPage.fill('#paxMobile', '3');
await repoPage.fill('#healixRef', 'HLX-REPO-1');
await repoPage.fill('#escortName', 'R. Escort');
await repoPage.fill('#pin', '482137');
await repoPage.fill('#pinConfirm', '482137');
await repoPage.click('button:has-text("Save case on this device")');
await repoPage.waitForSelector('.patient-banner');

// Online/offline indicator
check('Online badge shows Online', (await repoPage.textContent('[data-testid="online-badge"]')) === 'Online');
await repoContext.setOffline(true);
await repoPage.waitForSelector('[data-testid="online-badge"]:has-text("Offline")');
check('Badge flips to Offline when connection is lost', true);
await repoContext.setOffline(false);
await repoPage.waitForSelector('[data-testid="online-badge"]:has-text("Online")');

// Complete the mandatory LMWH, then submit to the repository.
await repoPage.click('.tab:has-text("Repat record")');
const repoLmwh = repoPage.locator('section:has(h2:has-text("Low molecular weight heparin"))');
await repoLmwh.locator('button:text-is("No")').click();
await repoLmwh.locator('.field:has(label:has-text("Reason LMWH not given")) textarea').fill('Short ambulant transfer.');
await repoPage.click('button:has-text("Export / Finish")');
await repoPage.waitForSelector('[data-testid="submit-repo"]');
check('Repository submission offered when the repository is hosted', true);
await repoPage.click('[data-testid="submit-repo"]');
await repoPage.waitForSelector('text=Submitted to the desk repository', { timeout: 60000 });
check('Case submitted to the repository', true);

// Server side: auth required, then the submission is there with a real PDF.
const unauth = await fetch('http://localhost:4180/api/submissions');
check('Repository list requires the desk token', unauth.status === 401);
const auth = { Authorization: `Basic ${Buffer.from(`desk:${DESK_TOKEN}`).toString('base64')}` };
const list = await (await fetch('http://localhost:4180/api/submissions', { headers: auth })).json();
check(
  'Submission stored with case details',
  list.submissions.length === 1 && list.submissions[0].caseRef === 'HLX-REPO-1' && list.submissions[0].fullPdfBytes > 1000,
);
const pdfBytes = Buffer.from(
  await (await fetch(`http://localhost:4180/api/submissions/${list.submissions[0].id}/full.pdf`, { headers: auth })).arrayBuffer(),
);
check('Stored full-record PDF downloads and is a PDF', pdfBytes.subarray(0, 4).toString() === '%PDF');

// Offline queueing: submit with no connection, then reconnect → auto-flush.
await repoContext.setOffline(true);
await repoPage.click('[data-testid="submit-repo"]');
await repoPage.waitForSelector('text=submission queued on this device');
check('Offline submission queues on the device', true);
await repoContext.setOffline(false);
await repoPage.waitForSelector('text=queued submission sent to the desk repository', { timeout: 30000 });
const list2 = await (await fetch('http://localhost:4180/api/submissions', { headers: auth })).json();
check('Queued submission auto-sends when back online', list2.submissions.length === 2);

await repoContext.close();
repoProc.kill();

await browser.close();
console.log(results.join('\n'));
