import * as vscode from 'vscode';

interface RateCache {
	rates: Record<string, number>;
	base: string;
	timestamp: number;
}

export class CurrencyConverter {
	private cache: RateCache | null = null;
	private readonly cacheTtlMs = 86_400_000; // 24 hours
	private readonly apiUrl = 'https://open.er-api.com/v6/latest/USD';

	/**
	 * Convert USD amount to target currency.
	 * Returns the original USD amount if conversion fails or target is USD.
	 */
	async convert(usdAmount: number, targetCurrency: string): Promise<{ amount: number; rate: number; currency: string }> {
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
		} catch (err) {
			console.warn(`AI Balance: currency conversion failed for ${targetCurrency}`, err);
			return { amount: usdAmount, rate: 1, currency: 'USD' };
		}
	}

	private async getRate(targetCurrency: string): Promise<number> {
		// Check cache first
		if (this.cache && Date.now() - this.cache.timestamp < this.cacheTtlMs) {
			const rate = this.cache.rates[targetCurrency];
			if (rate) return rate;
		}

		// Fetch fresh rates
		const response = await fetch(this.apiUrl);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status} from exchange rate API`);
		}

		const data: any = await response.json();
		// open.er-api.com returns: { result: "success", base_code: "USD", rates: { EUR: 0.92, PLN: 3.98, ... } }
		if (data.result !== 'success') {
			throw new Error('Exchange rate API returned error');
		}
		const rates = data.rates as Record<string, number>;
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
	static getSymbol(currency: string): string {
		const symbols: Record<string, string> = {
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
