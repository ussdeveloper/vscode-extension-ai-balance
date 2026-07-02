/**
 * DeepSeek peak/off-peak pricing indicator for Poland timezone.
 *
 * DeepSeek peak hours (UTC): 1:00–4:00 AM and 6:00–10:00 AM → 2× price
 * Poland (CEST, UTC+2):      3:00–6:00 AM and 8:00 AM–12:00 PM
 *
 * Best (off-peak) times for Poland (UTC+2):
 *   12:00–24:00  — afternoon & evening, standard price
 *   06:00–08:00  — early morning, standard price
 *   00:00–03:00  — night, good for automated tasks
 *
 * Avoid (peak):  03:00–06:00 and 08:00–12:00
 */

export function isDeepSeekPeakHours(): boolean {
	const now = new Date();

	// Poland is UTC+2 during summer (CEST)
	const polandHour = (now.getUTCHours() + 2) % 24;
	const polandMinutes = now.getUTCMinutes();
	const polandTotalMinutes = polandHour * 60 + polandMinutes;

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
		'🔴 03:00–06:00 oraz 08:00–12:00 — cena 2×\n' +
		'🟢 12:00–24:00, 06:00–08:00, 00:00–03:00 — cena standardowa'
	);
}
