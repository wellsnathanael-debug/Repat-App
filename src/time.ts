// All timestamps are stored as ISO 8601 UTC strings and displayed as
// "14:32 UK (13:32 UTC)" — UK clock time first (per the repat desk's
// preference), UTC alongside so the record is unambiguous year-round.

const UK_TZ = 'Europe/London';

export function nowIso(): string {
  return new Date().toISOString();
}

/** Minutes that UK clock time is ahead of UTC at the given instant (0 or 60). */
function ukOffsetMinutes(date: Date): number {
  const part = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TZ,
    timeZoneName: 'shortOffset',
  })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')?.value; // "GMT" or "GMT+1"
  const match = part?.match(/GMT([+-]\d+)?/);
  return match?.[1] ? Number(match[1]) * 60 : 0;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "07 Jul 2026, 14:32 UK (13:32 UTC)" */
export function formatUkUtc(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const uk = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  const utc = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  return `${uk} UK (${utc} UTC)`;
}

/** ISO UTC → "YYYY-MM-DDTHH:mm" in UK wall-clock time, for datetime-local inputs. */
export function isoToUkInput(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() + ukOffsetMinutes(date) * 60_000);
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
  );
}

/** "YYYY-MM-DDTHH:mm" entered as UK wall-clock time → ISO UTC. */
export function ukInputToIso(input: string): string {
  if (!input) return '';
  const asUtc = new Date(`${input}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return '';
  // First guess using the offset at the naive instant, then re-check with the
  // corrected instant so times right at a DST changeover resolve properly.
  let result = new Date(asUtc.getTime() - ukOffsetMinutes(asUtc) * 60_000);
  result = new Date(asUtc.getTime() - ukOffsetMinutes(result) * 60_000);
  return result.toISOString();
}

/** "5 h 20 m" between two ISO timestamps; '' if either is missing/invalid. */
export function durationBetween(startIso: string | undefined, endIso: string | undefined): string {
  if (!startIso || !endIso) return '';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (Number.isNaN(ms)) return '';
  if (ms < 0) return 'arrival is before the start of repat — check both times';
  const totalMinutes = Math.round(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h} h ${m} m`;
}
