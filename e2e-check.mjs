import { chromium } from 'playwright-core';

const SHOT = process.env.SHOT_DIR ?? '.';
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

// --- 1. Start screen → setup ---
await page.goto('http://localhost:4173/Repat-App/');
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
await page.fill('#pin', '4821');
await page.fill('#pinConfirm', '4821');
await page.screenshot({ path: `${SHOT}/1-setup.png`, fullPage: true });
await page.click('button:has-text("Save case on this device")');

// --- 2. Main screen after setup (auto-unlocked) ---
await page.waitForSelector('.patient-banner');
const banner = await page.textContent('.patient-banner');
check('Patient details auto-populate banner', banner.includes('Jane Elizabeth Doe') && banner.includes('HLX-2026-04821'));

// --- 3. Lock / unlock round-trip ---
await page.click('button:has-text("Lock")');
await page.waitForSelector('#unlock-pin');
await page.fill('#unlock-pin', '9999');
await page.click('button:has-text("Unlock")');
check('Wrong PIN rejected', await page.isVisible('text=Incorrect PIN'));
await page.fill('#unlock-pin', '4821');
await page.click('button:has-text("Unlock")');
await page.waitForSelector('.patient-banner');
check('Correct PIN unlocks', true);

// --- 4. Fill form fields ---
const sectionField = (section, label) =>
  page.locator(`section:has(h2:text-is("${section}")) .field:has(label:text-is("${label}")) textarea`);

await page.fill('section:has(h2:text-is("Diagnosis")) textarea', 'Left total hip replacement following fall; post-op day 9.');
await page.fill('section:has(h2:text-is("Allergies")) textarea', 'Penicillin — rash.');
await sectionField('Cardiovascular', 'BP').fill('128/76');
await sectionField('Cardiovascular', 'HR').fill('72 regular');
await sectionField('Respiratory', 'RR').fill('16');

// datetime field
await page.fill('input[type="datetime-local"]', '2026-07-07T08:30');

// --- 5. N/A tick blanks and disables its text box ---
const coughField = page.locator('section:has(h2:text-is("Respiratory")) .field:has(label:text-is("Cough/respiratory symptoms"))');
await coughField.locator('textarea').fill('to be blanked');
await coughField.locator('.na-toggle input').check();
const coughVal = await coughField.locator('textarea').inputValue();
const coughDisabled = await coughField.locator('textarea').isDisabled();
check('N/A tick blanks and disables field', coughVal === '' && coughDisabled);

// --- 6. Yes/No/NA buttons ---
const passports = page.locator('.field:has(label:text-is("Does the patient / travel companion(s) have their passports"))');
await passports.locator('button:text-is("Yes")').click();
check('Yes/No/NA selection', (await passports.locator('button.selected').textContent()) === 'Yes');

// --- 7. Section-level N/A blanks whole section ---
const admitted = page.locator('section:has(h2:text-is("If still admitted overseas"))');
await admitted.locator('button:text-is("Yes")').first().click();
await admitted.locator('textarea').fill('some text');
await admitted.locator('.section-na input').check();
const admittedDisabled = await admitted.locator('textarea').isDisabled();
const admittedBtnsDisabled = await admitted.locator('button:text-is("Yes")').first().isDisabled();
const admittedVal = await admitted.locator('textarea').inputValue();
check('Section N/A blanks and disables all child fields', admittedDisabled && admittedBtnsDisabled && admittedVal === '');
await page.screenshot({ path: `${SHOT}/2-form.png`, fullPage: false });

// --- 8. Autosave persists across reload (offline resilience) ---
await page.reload();
await page.waitForSelector('#unlock-pin');
await page.fill('#unlock-pin', '4821');
await page.click('button:has-text("Unlock")');
await page.waitForSelector('.patient-banner');
const diagVal = await page.locator('section:has(h2:text-is("Diagnosis")) textarea').inputValue();
const coughStillNA = await page
  .locator('section:has(h2:text-is("Respiratory")) .field:has(label:text-is("Cough/respiratory symptoms")) .na-toggle input')
  .isChecked();
check('Entries persist after reload (autosave)', diagVal.includes('hip replacement') && coughStillNA);

// --- 9. Placeholder tabs ---
await page.click('.tab:has-text("In-flight record")');
check('Placeholder tab renders', await page.isVisible('text=coming soon'));
await page.click('.tab:has-text("Pre repatriation assessment")');

// --- 10. Export PDF (falls back to download in desktop chromium) ---
await page.click('button:has-text("Export / Finish")');
await page.waitForSelector('text=Export & finish');
const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
await page.click('button:has-text("Generate & share PDF")');
const download = await downloadPromise;
const pdfPath = `${SHOT}/${download.suggestedFilename()}`;
await download.saveAs(pdfPath);
check('PDF exported', true, download.suggestedFilename());

// --- 11. Clear case wipes device ---
await page.click('button:has-text("Clear case…")');
await page.click('button:has-text("Yes, delete everything")');
await page.waitForSelector('text=No case is currently on this device');
await page.reload();
await page.waitForSelector('text=No case is currently on this device');
check('Clear case wipes data; app ready for next case', true);

// --- 12. Offline: service worker serves the app with network cut ---
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

// --- 13. Case-code handoff: desk generates a code, escort loads it ---
// Desk side (this device was just cleared; nothing should be saved here).
await page.click('.start-option:has-text("Set up a new case")');
await page.fill('#patientName', 'Robert Smith');
await page.fill('#dob', '1949-11-02');
await page.fill('#homeAddress', '3 Mill Lane, Leeds, LS1 2AB, UK');
await page.fill('#paxMobile', '+44 7700 900456');
await page.fill('#healixRef', 'HLX-2026-05512');
await page.fill('#escortName', 'A. Escort RN');
await page.fill('#pin', '731905');
await page.fill('#pinConfirm', '731905');
await page.click('button:has-text("Generate case code for escort")');
await page.waitForSelector('text=Case code ready');
const code = await page.locator('textarea.code-input').inputValue();
check('Desk can generate an encrypted case code', code.startsWith('RPT1.'));
await page.screenshot({ path: `${SHOT}/3-case-code.png`, fullPage: true });
await page.click('button:has-text("Done")');
await page.reload();
await page.waitForSelector('text=No case is currently on this device');
check('Generating a code saves nothing on the desk device', true);

// Escort side: a completely fresh device (new browser context).
const escortContext = await browser.newContext({ viewport: { width: 1024, height: 1366 } });
const escortPage = await escortContext.newPage();
await escortPage.goto('http://localhost:4173/Repat-App/');
await escortPage.click('.start-option:has-text("Load case from code")');
await escortPage.fill('#case-code', code);
await escortPage.fill('#load-pin', '999999');
await escortPage.click('button:has-text("Load case")');
await escortPage.waitForSelector('text=Could not load the case');
check('Wrong PIN cannot decrypt the case code', true);
await escortPage.fill('#load-pin', '731905');
await escortPage.click('button:has-text("Load case")');
await escortPage.waitForSelector('.patient-banner');
const escortBanner = await escortPage.textContent('.patient-banner');
check(
  'Escort loads case with code + PIN; details auto-populate',
  escortBanner.includes('Robert Smith') && escortBanner.includes('HLX-2026-05512'),
);
await escortContext.close();

// --- 14. #case= link opens the app with the code pre-filled ---
const linkContext = await browser.newContext({ viewport: { width: 1024, height: 1366 } });
const linkPage = await linkContext.newPage();
await linkPage.goto(`http://localhost:4173/Repat-App/#case=${code}`);
await linkPage.waitForSelector('#case-code');
const prefilled = await linkPage.locator('#case-code').inputValue();
check('Case link pre-fills the code on the escort device', prefilled === code);
await linkContext.close();

await browser.close();
console.log(results.join('\n'));
