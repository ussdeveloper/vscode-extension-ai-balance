/**
 * DeepSeek peak/off-peak pricing indicator.
 *
 * Official pricing (https://api-docs.deepseek.com/quick_start/pricing):
 *   Peak hours: 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday → 2× price.
 *   All other hours and weekends are off-peak (half price).
 *
 * Detection uses absolute UTC instants (timezone-independent), while all
 * labels and descriptions are rendered in the SYSTEM's local time, so the
 * countdown always matches the local clock.
 *
 * Weekends (Saturday & Sunday, Beijing Time) are charged uniformly at the
 * off-peak rate — peak hours do NOT apply on weekends.
 * "Weekend" is determined in Beijing Time (UTC+8), because that is the
 * timezone DeepSeek uses for billing.
 */

const BEIJING_UTC_OFFSET_MINUTES = 8 * 60; // UTC+8, no DST

/**
 * Official peak slots in UTC (minutes of day): 01:00–04:00 and 06:00–10:00,
 * Monday–Friday.
 */
const PEAK_SLOTS_UTC: ReadonlyArray<[number, number]> = [
	[1 * 60, 4 * 60],
	[6 * 60, 10 * 60]
];

/**
 * Is it Saturday or Sunday in Beijing Time (UTC+8)?
 * DeepSeek bills by Beijing Time, so the weekend rule is decided there.
 */
export function isDeepSeekWeekend(at: Date = new Date()): boolean {
	const utcMinutesOfDay = at.getUTCHours() * 60 + at.getUTCMinutes();
	const crossedMidnight = utcMinutesOfDay + BEIJING_UTC_OFFSET_MINUTES >= 24 * 60;
	const beijingDay = (at.getUTCDay() + (crossedMidnight ? 1 : 0)) % 7; // 0=Sun, 6=Sat

	return beijingDay === 0 || beijingDay === 6;
}

export function isDeepSeekPeakHours(at: Date = new Date()): boolean {
	// Weekends (Beijing Time): peak hours do NOT apply — off-peak all day
	if (isDeepSeekWeekend(at)) {
		return false;
	}

	// Peak slots are defined in UTC (absolute instants) — independent from the
	// system timezone, so the state flips at the same moment for everyone.
	const utcMinutes = at.getUTCHours() * 60 + at.getUTCMinutes();

	return PEAK_SLOTS_UTC.some(([start, end]) => utcMinutes >= start && utcMinutes < end);
}

/**
 * Returns 'PEAK' or 'OFF-PEAK' label for the current time.
 */
export function getDeepSeekPeakLabel(): string {
	return isDeepSeekPeakHours() ? 'PEAK' : 'OFF-PEAK';
}

/** Formats minutes-of-day (may exceed/wrap a day) as "HH:MM". */
function formatClock(minutesOfDay: number): string {
	const m = ((minutesOfDay % 1440) + 1440) % 1440;
	return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
}

/** "pon–pt" / "ndz–czw" / "pon, śr, pt" style label for a set of local weekdays. */
function formatWeekdaySet(days: Set<number>): string {
	const ordered = POLISH_WEEKDAY_ORDER.filter((d) => days.has(d));
	if (ordered.length === 0) {
		return '';
	}
	if (ordered.length === 1) {
		return POLISH_DAYS[ordered[0]];
	}

	const indices = ordered.map((d) => POLISH_WEEKDAY_ORDER.indexOf(d));
	const gaps: number[] = [];
	for (let i = 1; i < indices.length; i++) {
		if (indices[i] !== indices[i - 1] + 1) {
			gaps.push(i);
		}
	}

	if (gaps.length === 0) {
		return `${POLISH_DAYS[ordered[0]]}–${POLISH_DAYS[ordered[ordered.length - 1]]}`;
	}
	if (gaps.length === 1) {
		// Cycle wraps around the week (e.g. ndz–czw)
		const k = gaps[0];
		return `${POLISH_DAYS[ordered[k]]}–${POLISH_DAYS[ordered[k - 1]]}`;
	}
	return ordered.map((d) => POLISH_DAYS[d]).join(', ');
}

/**
 * Returns a human-readable description of peak hours in the system's LOCAL
 * time, including which local weekdays each slot applies to (weekends are
 * excluded automatically).
 */
export function getPeakHoursDescription(at: Date = new Date()): string {
	const offsetMinutes = -at.getTimezoneOffset();
	const baseMidnight = new Date(at);
	baseMidnight.setHours(0, 0, 0, 0);

	const slotTexts = PEAK_SLOTS_UTC.map(([startUtc, endUtc]) => {
		const startLocal = startUtc + offsetMinutes;
		const label = `${formatClock(startLocal)}–${formatClock(endUtc + offsetMinutes)}`;

		// Which local weekdays does this slot actually apply to? Probe one
		// occurrence of each local day at the slot start (+1 min), honouring
		// the Beijing-time weekend exclusion.
		const probeMinutes = ((startLocal % 1440) + 1440) % 1440;
		const days = new Set<number>();
		for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
			const probe = new Date(baseMidnight);
			probe.setDate(probe.getDate() + dayOffset);
			probe.setMinutes(probeMinutes + 1);
			if (isDeepSeekPeakHours(probe)) {
				days.add(probe.getDay());
			}
		}

		const weekdayLabel = formatWeekdaySet(days);
		return weekdayLabel ? `${label} (${weekdayLabel})` : label;
	});

	return (
		'DeepSeek peak hours (czas lokalny systemu):\n' +
		`🔴 ${slotTexts.join(' oraz ')} — cena 2×\n` +
		'🟢 Weekend (sob–niedz, wg czasu pekińskiego): cały dzień poza szczytem\n' +
		'🟢 Poza tymi godzinami — cena off-peak (½ ceny peak)'
	);
}

export interface PeakTransition {
	/** Minutes from `from` until the pricing state flips. */
	minutes: number;
	/** The state that starts at the transition. */
	next: 'peak' | 'off-peak';
	/** Exact moment of the transition (local system time). */
	at: Date;
}

/**
 * Finds the next moment when DeepSeek pricing switches between peak and
 * off-peak. Weekends are skipped automatically, because peak hours do not
 * apply then. Pure local computation from system time — no API calls.
 */
export function getNextPeakTransition(from: Date = new Date()): PeakTransition {
	const current = isDeepSeekPeakHours(from);
	const capMinutes = 5 * 24 * 60; // the longest stretch (weekend) is ~63 h

	for (let minutes = 1; minutes <= capMinutes; minutes++) {
		const at = new Date(from.getTime() + minutes * 60_000);
		if (isDeepSeekPeakHours(at) !== current) {
			return { minutes, next: current ? 'off-peak' : 'peak', at };
		}
	}

	// Fallback — should never happen, but never hang the status bar either
	const at = new Date(from.getTime() + capMinutes * 60_000);
	return { minutes: capMinutes, next: current ? 'off-peak' : 'peak', at };
}

/** Formats a minute count as h:mm (e.g. 83 → "1:23"). */
export function formatCountdown(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${h}:${m.toString().padStart(2, '0')}`;
}

const POLISH_DAYS = ['ndz', 'pon', 'wt', 'śr', 'czw', 'pt', 'sob'];
const POLISH_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // pon → ndz

/** Formats a transition moment as a short local label, e.g. "pon 03:00". */
export function formatTransitionTarget(at: Date): string {
	const hh = at.getHours().toString().padStart(2, '0');
	const mm = at.getMinutes().toString().padStart(2, '0');
	return `${POLISH_DAYS[at.getDay()]} ${hh}:${mm}`;
}
