/** Shared number formatting helpers. */

/** Formats an integer with spaces as thousands separators, e.g. 98041328 → "98 041 328". */
export function formatTokens(value: number): string {
	return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Formats a USD amount with sensible precision, e.g. 0.8314 → "$0.8314", 12.3 → "$12.30". */
export function formatUsdAmount(value: number): string {
	const digits = value >= 1 ? 2 : 4;
	return `$${value.toFixed(digits)}`;
}

/** Compact form for chart axis labels, e.g. 98041328 → "98.0M". */
export function formatCompact(value: number): string {
	if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
	return String(Math.round(value));
}
