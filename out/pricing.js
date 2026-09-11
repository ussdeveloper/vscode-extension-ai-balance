"use strict";
/**
 * DeepSeek model pricing shown in the status bar tooltip.
 *
 * Source: https://api-docs.deepseek.com/quick_start/pricing (retrieved 2026-09-11)
 * Prices are USD per 1M tokens. Off-peak rates are half of the peak rates;
 * peak hours are 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday
 * (weekends and all other hours are off-peak).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEEPSEEK_MODELS = void 0;
exports.formatPriceUsd = formatPriceUsd;
exports.getModelPricingLines = getModelPricingLines;
exports.DEEPSEEK_MODELS = [
    {
        model: 'deepseek-flash',
        peak: { inputCacheHit: 0.006, inputCacheMiss: 0.3, output: 1.2 },
        offPeak: { inputCacheHit: 0.003, inputCacheMiss: 0.15, output: 0.6 }
    },
    {
        model: 'deepseek-v4-pro',
        peak: { inputCacheHit: 0.044, inputCacheMiss: 1.32, output: 3.96 },
        offPeak: { inputCacheHit: 0.022, inputCacheMiss: 0.66, output: 1.98 }
    }
];
/** e.g. 0.3 → "$0.30", 0.003 → "$0.003". */
function formatPriceUsd(value) {
    const digits = value > 0 && value < 0.01 ? 3 : 2;
    return `$${value.toFixed(digits)}`;
}
/** Readable price lines for the tooltip (peak + off-peak per model). */
function getModelPricingLines() {
    const lines = ['💰 Cennik DeepSeek (USD / 1M tokenów)'];
    for (const m of exports.DEEPSEEK_MODELS) {
        const pad = ' '.repeat(m.model.length + 2);
        lines.push(`  ${m.model}: wejście ${formatPriceUsd(m.peak.inputCacheMiss)} (cache-hit ${formatPriceUsd(m.peak.inputCacheHit)}) · wyjście ${formatPriceUsd(m.peak.output)} [peak]`);
        lines.push(`  ${pad}off-peak: wejście ${formatPriceUsd(m.offPeak.inputCacheMiss)} (cache-hit ${formatPriceUsd(m.offPeak.inputCacheHit)}) · wyjście ${formatPriceUsd(m.offPeak.output)}`);
    }
    lines.push('  źródło: api-docs.deepseek.com/quick_start/pricing');
    return lines;
}
//# sourceMappingURL=pricing.js.map