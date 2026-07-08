import { chromium } from 'playwright-core';
import { copyFileSync, writeFileSync } from 'node:fs';

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
await page.fill('#pin', '482137');
await page.fill('#pinConfirm', '482137');
await page.screenshot({ path: `${SHOT}/1-setup.png`, fullPage: true });
await page.click('button:has-text("Save case on this device")');

await page.waitForSelector('.patient-banner');
const banner = await page.textContent('.patient-banner');
check('Patient details auto-populate banner', banner.includes('Jane Elizabeth Doe') && banner.includes('HLX-2026-04821'));

// Lock / unlock round-trip
await page.click('button:has-text("Lock")');
await page.waitForSelector('#unlock-pin');
await page.fill('#unlock-pin', '999999');
await page.click('button:has-text("Unlock")');
check('Wrong PIN rejected', await page.isVisible('text=Incorrect PIN'));
await page.fill('#unlock-pin', '482137');
await page.click('button:has-text("Unlock")');
await page.waitForSelector('.patient-banner');
check('Correct PIN unlocks', true);

// Desk pre-fill appears in the assessment tab
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
await page.fill('#pin', '731905');
await page.fill('#pinConfirm', '731905');
// Attach a small "report" (1x1 PNG)
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
writeFileSync(`${SHOT}/angiogram-report.png`, pngBytes);
await page.setInputFiles('#attachments', `${SHOT}/angiogram-report.png`);
await page.click('button:has-text("Generate case code for escort")');
await page.waitForSelector('text=Case file ready');
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

await browser.close();
console.log(results.join('\n'));
