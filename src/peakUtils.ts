/**
 * DeepSeek peak/off-peak pricing indicator.
 *
 * DeepSeek peak hours (UTC): 01:00–04:00 and 06:00–10:00, Monday–Friday → 2× price
 * Poland (CEST, UTC+2):      03:00–06:00 and 08:00–12:00
 *
 * Since 2026-08-23: weekends (Saturday & Sunday, Beijing Time) are charged
 * uniformly at the off-peak rate — peak hours do NOT apply on weekends.
 * "Weekend" is determined in Beijing Time (UTC+8), because that is the
 * timezone DeepSeek uses for billing.
 *
 * Best (off-peak) times for Poland (UTC+2):
 *   12:00–24:00  — afternoon & evening, standard price
 *   06:00–08:00  — early morning, standard price
 *   00:00–03:00  — night, good for automated tasks
 *
 * Avoid (peak, weekdays only): 03:00–06:00 and 08:00–12:00
 */

const BEIJING_UTC_OFFSET_MINUTES = 8 * 60; // UTC+8, no DST
const POLAND_CEST_OFFSET_MINUTES = 2 * 60; // Poland summer time (CEST, UTC+2)

/**
 * Is it Saturday or Sunday in Beijing Time (UTC+8)?
 * DeepSeek bills by Beijing Time, so the weekend rule is decided there.
 */
export function isDeepSeekWeekend(): boolean {
	const now = new Date();
	const utcMinutesOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
	const crossedMidnight = utcMinutesOfDay + BEIJING_UTC_OFFSET_MINUTES >= 24 * 60;
	const beijingDay = (now.getUTCDay() + (crossedMidnight ? 1 : 0)) % 7; // 0=Sun, 6=Sat

	return beijingDay === 0 || beijingDay === 6;
}

export function isDeepSeekPeakHours(): boolean {
	// Weekends (Beijing Time): off-peak all day since 2026-08-23
	if (isDeepSeekWeekend()) {
		return false;
	}

	const now = new Date();

	// Poland is UTC+2 during summer (CEST)
	const polandTotalMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + POLAND_CEST_OFFSET_MINUTES) % (24 * 60);

	// Peak slots in Poland (UTC+2 summer):
	//   Slot 1: 3:00–6:00  (180–360 min)
	//   Slot 2: 8:00–12:00 (480–720 min)
	const peak1Start = 3 * 60;
	const peak1End = 6 * 60;
	const peak2Start = 8 * 60;
	const peak2End = 12 * 60;

	return (
		(polandTotalMinutes >= peak1Start && polandTotalMinutes < peak1End) ||
		(polandTotalMinutes >= peak2Start && polandTotalMinutes < peak2End)
	);
}

/**
 * Returns 'PEAK' or 'OFF-PEAK' label for the current time.
 */
export function getDeepSeekPeakLabel(): string {
	return isDeepSeekPeakHours() ? 'PEAK' : 'OFF-PEAK';
}

/**
 * Returns a human-readable description of peak hours for Poland timezone.
 */
export function getPeakHoursDescription(): string {
	return (
		'DeepSeek peak hours (Polska, UTC+2):\n' +
		'🔴 03:00–06:00 oraz 08:00–12:00 (pon–pt) — cena 2×\n' +
		'🟢 Weekend (sob–niedz, wg czasu pekińskiego): cały dzień poza szczytem\n' +
		'🟢 12:00–24:00, 06:00–08:00, 00:00–03:00 — cena standardowa'
	);
}
