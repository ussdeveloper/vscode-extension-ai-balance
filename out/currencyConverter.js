"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrencyConverter = void 0;
class CurrencyConverter {
    cache = null;
    cacheTtlMs = 86_400_000; // 24 hours
    apiUrl = 'https://open.er-api.com/v6/latest/USD';
    /**
     * Convert USD amount to target currency.
     * Returns the original USD amount if conversion fails or target is USD.
     */
    async convert(usdAmount, targetCurrency) {
        if (!targetCurrency || targetCurrency === 'USD' || targetCurrency === '') {
            return { amount: usdAmount, rate: 1, currency: 'USD' };
        }
        try {
            const rate = await this.getRate(targetCurrency);
            return {
                amount: usdAmount * rate,
                rate,
                currency: targetCurrency
            };
        }
        catch (err) {
            console.warn(`AI Balance: currency conversion failed for ${targetCurrency}`, err);
            return { amount: usdAmount, rate: 1, currency: 'USD' };
        }
    }
    async getRate(targetCurrency) {
        // Check cache first
        if (this.cache && Date.now() - this.cache.timestamp < this.cacheTtlMs) {
            const rate = this.cache.rates[targetCurrency];
            if (rate)
                return rate;
        }
        // Fetch fresh rates
        const response = await fetch(this.apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} from exchange rate API`);
        }
        const data = await response.json();
        // open.er-api.com returns: { result: "success", base_code: "USD", rates: { EUR: 0.92, PLN: 3.98, ... } }
        if (data.result !== 'success') {
            throw new Error('Exchange rate API returned error');
        }
        const rates = data.rates;
        if (!rates) {
            throw new Error('Unexpected exchange rate API response');
        }
        this.cache = {
            rates,
            base: 'USD',
            timestamp: Date.now()
        };
        const rate = rates[targetCurrency];
        if (!rate) {
            throw new Error(`No rate for currency: ${targetCurrency}`);
        }
        return rate;
    }
    /**
     * Get the currency symbol for display
     */
    static getSymbol(currency) {
        const symbols = {
            USD: '$',
            EUR: '€',
            PLN: 'zł',
            GBP: '£',
            JPY: '¥',
            CAD: 'C$',
            AUD: 'A$',
            CHF: 'Fr',
            CNY: '¥',
            CZK: 'Kč',
            DKK: 'kr',
            HUF: 'Ft',
            NOK: 'kr',
            SEK: 'kr'
        };
        return symbols[currency] || currency;
    }
}
exports.CurrencyConverter = CurrencyConverter;
//# sourceMappingURL=currencyConverter.js.map