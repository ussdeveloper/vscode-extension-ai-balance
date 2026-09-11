import * as vscode from 'vscode';

export interface ProviderBalance {
	name: string;
	key: string;
	balance: number | null;
	total: number | null;
	/** Cumulative usage in USD when the provider exposes it (e.g. OpenRouter). */
	usage?: number;
	error?: string;
}

export class BalanceProvider {
	private secrets: vscode.SecretStorage;

	constructor(secrets: vscode.SecretStorage) {
		this.secrets = secrets;
	}

	async fetchAll(): Promise<ProviderBalance[]> {
		const results: ProviderBalance[] = [];
		const config = vscode.workspace.getConfiguration('aiBalance');

		// DeepSeek
		const dsEnabled = config.get<boolean>('providers.deepseek.enabled', true);
		if (dsEnabled) {
			const result = await this.fetchDeepSeek(config);
			if (result) results.push(result);
		}

		// OpenRouter
		const orEnabled = config.get<boolean>('providers.openrouter.enabled', true);
		if (orEnabled) {
			const result = await this.fetchOpenRouter(config);
			if (result) results.push(result);
		}

		return results;
	}

	private async getSecret(key: string): Promise<string | undefined> {
		try {
			return await this.secrets.get(key);
		} catch {
			return undefined;
		}
	}

	private async fetchDeepSeek(config: vscode.WorkspaceConfiguration): Promise<ProviderBalance | null> {
		const apiKey = await this.getSecret('aiBalance.deepseek.apiKey');
		const apiUrl = config.get<string>('providers.deepseek.apiUrl', 'https://api.deepseek.com');

		if (!apiKey) {
			return { name: 'DeepSeek', key: 'deepseek', balance: null, total: null, error: 'No API key' };
		}

		try {
			const response = await fetch(`${apiUrl}/user/balance`, {
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Accept': 'application/json'
				}
			});

			if (!response.ok) {
				return { name: 'DeepSeek', key: 'deepseek', balance: null, total: null, error: `HTTP ${response.status}` };
			}

			const data: any = await response.json();
			const balanceInfo = data.balance_infos?.[0];
			if (balanceInfo) {
				const total = parseFloat(balanceInfo.total_balance || '0');
				return { name: 'DeepSeek', key: 'deepseek', balance: total, total: total };
			}

			return { name: 'DeepSeek', key: 'deepseek', balance: null, total: null, error: 'Unexpected response' };
		} catch (err: any) {
			return { name: 'DeepSeek', key: 'deepseek', balance: null, total: null, error: err.message };
		}
	}

	private async fetchOpenRouter(config: vscode.WorkspaceConfiguration): Promise<ProviderBalance | null> {
		const apiKey = await this.getSecret('aiBalance.openrouter.apiKey');
		const apiUrl = config.get<string>('providers.openrouter.apiUrl', 'https://openrouter.ai/api');

		if (!apiKey) {
			return { name: 'OpenRouter', key: 'openrouter', balance: null, total: null, error: 'No API key' };
		}

		try {
			// Credits endpoint: GET /api/v1/credits
			// Returns: { data: { total_credits: 65, total_usage: 9.57 } }
			const creditsRes = await fetch(`${apiUrl}/v1/credits`, {
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Accept': 'application/json'
				}
			});

			if (creditsRes.ok) {
				const creditsData: any = await creditsRes.json();
				const d = creditsData?.data;
				if (d && typeof d.total_credits === 'number') {
					const balance = d.total_credits - (d.total_usage ?? 0);
					return {
						name: 'OpenRouter',
						key: 'openrouter',
						balance,
						total: null,
						usage: d.total_usage ?? 0
					};
				}
			}

			// Fallback: auth/key → { data: { usage, limit } }
			const response = await fetch(`${apiUrl}/v1/auth/key`, {
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Accept': 'application/json'
				}
			});

			if (!response.ok) {
				return { name: 'OpenRouter', key: 'openrouter', balance: null, total: null, error: `HTTP ${response.status}` };
			}

			const data: any = await response.json();
			if (data?.data) {
				const usage = data.data.usage ?? 0;
				const limit = data.data.limit ?? 0;
				const balance = limit > 0 ? limit - usage : usage;
				return {
					name: 'OpenRouter',
					key: 'openrouter',
					balance,
					total: null,
					usage
				};
			}

			return { name: 'OpenRouter', key: 'openrouter', balance: null, total: null, error: 'Unexpected response' };
		} catch (err: any) {
			return { name: 'OpenRouter', key: 'openrouter', balance: null, total: null, error: err.message };
		}
	}
}
