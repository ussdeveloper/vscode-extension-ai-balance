import * as vscode from 'vscode';
import { BalanceProvider, ProviderBalance } from './balanceProvider.js';
import { CurrencyConverter } from './currencyConverter.js';
import { DailyCostTracker } from './dailyCostTracker.js';
import {
	isDeepSeekPeakHours,
	isDeepSeekWeekend,
	getNextPeakTransition,
	formatCountdown,
	formatTransitionTarget,
	getPeakHoursDescription
} from './peakUtils.js';
import { formatUsdAmount } from './formatUtils.js';

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * "AI Balance" dashboard — a webview panel (editor tab) rendering:
 * provider balances, daily cost estimates (balance-snapshot based),
 * a 30-day cost chart, a 14-day breakdown table, and the peak-hours state.
 */
export class DashboardPanel {
	static currentPanel: DashboardPanel | undefined;
	private static readonly viewType = 'aiBalanceDashboard';

	private readonly panel: vscode.WebviewPanel;
	private readonly provider: BalanceProvider;
	private readonly costTracker: DailyCostTracker;
	private readonly currencyConverter: CurrencyConverter;
	private readonly disposables: vscode.Disposable[] = [];
	private refreshTimer: ReturnType<typeof setInterval> | undefined;
	private refreshing = false;

	static createOrShow(
		context: vscode.ExtensionContext,
		provider: BalanceProvider,
		costTracker: DailyCostTracker,
		currencyConverter: CurrencyConverter
	): void {
		const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

		if (DashboardPanel.currentPanel) {
			DashboardPanel.currentPanel.panel.reveal(column);
			void DashboardPanel.currentPanel.refresh(false);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			DashboardPanel.viewType,
			'AI Balance — Dashboard',
			column,
			{ retainContextWhenHidden: true, enableCommandUris: true }
		);

		DashboardPanel.currentPanel = new DashboardPanel(panel, context, provider, costTracker, currencyConverter);
	}

	static refreshCurrent(force: boolean): void {
		void DashboardPanel.currentPanel?.refresh(force);
	}

	private constructor(
		panel: vscode.WebviewPanel,
		context: vscode.ExtensionContext,
		provider: BalanceProvider,
		costTracker: DailyCostTracker,
		currencyConverter: CurrencyConverter
	) {
		this.panel = panel;
		this.provider = provider;
		this.costTracker = costTracker;
		this.currencyConverter = currencyConverter;

		this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icons', 'deepseek.png');
		this.panel.webview.html = this.shell('<div class="notice">Ładowanie danych…</div>');
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		void this.refresh(true);

		// Auto-refresh every 5 minutes while visible
		this.refreshTimer = setInterval(() => {
			if (this.panel.visible) {
				void this.refresh(false);
			}
		}, 5 * 60 * 1000);
	}

	private async refresh(_force: boolean): Promise<void> {
		if (this.refreshing) {
			return;
		}
		this.refreshing = true;
		try {
			const config = vscode.workspace.getConfiguration('aiBalance');
			const targetCurrency = config.get<string>('display.currency', 'USD');
			const symbol = CurrencyConverter.getSymbol(targetCurrency);

			const results = await this.provider.fetchAll();

			// Keep the daily baselines up to date even if the status bar timer is idle
			for (const r of results) {
				if (r.balance === null) {
					continue;
				}
				const useUsage = typeof r.usage === 'number';
				await this.costTracker.track(
					r.key,
					useUsage ? (r.usage as number) : r.balance,
					useUsage ? 'usage' : 'balance',
					r.balance
				);
			}

			// Share the lowest balance of the day across computers (webitcache)
			await this.costTracker.syncRemote();

			const body = await this.buildBody(results, targetCurrency, symbol);
			this.panel.webview.html = this.shell(body);
		} catch (err: any) {
			this.panel.webview.html = this.shell(
				`<header><h1>⚖️ AI Balance</h1></header><div class="notice warn">⚠️ Nie udało się odświeżyć danych: ${escapeHtml(err.message)}</div>`
			);
		} finally {
			this.refreshing = false;
		}
	}

	private async buildBody(results: ProviderBalance[], targetCurrency: string, symbol: string): Promise<string> {
		const sections: string[] = [];
		const time = new Date().toLocaleTimeString('pl-PL', { hour12: false });

		sections.push(`<header><h1>⚖️ AI Balance <span class="tag">dashboard</span></h1>
			<div class="sub">Zaktualizowano ${time} · koszty dzienne są szacowane na podstawie zmiany salda</div></header>`);

		// --- Balances ---------------------------------------------------------
		const balanceCards: string[] = [];
		for (const r of results) {
			balanceCards.push(await this.providerCard(r, targetCurrency, symbol));
		}
		if (balanceCards.length === 0) {
			balanceCards.push('<div class="notice">Brak skonfigurowanych providerów — dodaj klucze API w ustawieniach.</div>');
		}
		sections.push(`<section><h2>Salda</h2><div class="grid">${balanceCards.join('')}</div></section>`);

		// --- Daily costs --------------------------------------------------------
		sections.push(`<section><h2>Koszty dzienne (szacunek)</h2>${await this.dailyCostSection(results, targetCurrency, symbol)}</section>`);

		// --- Peak hours ---------------------------------------------------------
		sections.push(`<section><h2>Peak hours</h2>${this.peakCard()}</section>`);

		// --- Footer -------------------------------------------------------------
		sections.push(`<footer class="footer">
			<a class="btn" href="command:aiBalance.dashboardRefresh">${DashboardPanel.icon('refresh')}Odśwież</a>
			<a class="btn secondary" href="command:aiBalance.setDayStartBalance">${DashboardPanel.icon('pencil')}Saldo początkowe dnia</a>
			<a class="btn secondary" href="command:aiBalance.configure">${DashboardPanel.icon('settings')}Ustawienia</a>
		</footer>`);

		return sections.join('\n');
	}

	private async providerCard(r: ProviderBalance, targetCurrency: string, symbol: string): Promise<string> {
		const name = escapeHtml(r.name);
		if (r.balance === null) {
			return `<div class="card"><div class="label">${name}</div><div class="value">—</div><div class="extra">${escapeHtml(r.error ?? 'brak danych')}</div></div>`;
		}

		if (r.key === 'openrouter' && r.total !== null && r.total > 0) {
			const pct = Math.min((r.balance / r.total) * 100, 100).toFixed(1);
			return `<div class="card"><div class="label">${name} — budżet</div><div class="value">${pct}%</div><div class="extra">${formatUsdAmount(r.balance)} z ${formatUsdAmount(r.total)}</div></div>`;
		}

		let extra = '';
		if (targetCurrency !== 'USD') {
			const conv = await this.currencyConverter.convert(r.balance, targetCurrency);
			extra = `<div class="extra">${symbol}${conv.amount.toFixed(2)}</div>`;
		}
		return `<div class="card"><div class="label">${name} — saldo</div><div class="value">${formatUsdAmount(r.balance)}</div>${extra}</div>`;
	}

	private async formatMoney(usd: number, targetCurrency: string, symbol: string): Promise<string> {
		const usdStr = formatUsdAmount(usd);
		if (targetCurrency === 'USD') {
			return usdStr;
		}
		const conv = await this.currencyConverter.convert(usd, targetCurrency);
		return `${usdStr} (${symbol}${conv.amount.toFixed(2)})`;
	}

	private async dailyCostSection(
		results: ProviderBalance[],
		targetCurrency: string,
		symbol: string
	): Promise<string> {
		const tracked = results.filter((r) => r.balance !== null);
		if (tracked.length === 0) {
			return '<div class="notice">Koszty pojawią się po skonfigurowaniu kluczy API.</div>';
		}

		const monthLabel = DashboardPanel.monthLabel(new Date());

		let totalToday = 0;
		let totalMonth = 0;
		let earliestStart: number | null = null;
		const todayBits: string[] = [];
		const monthBits: string[] = [];

		for (const r of tracked) {
			const today = this.costTracker.getToday(r.key);
			const month = this.costTracker.getMonth(r.key);
			const todayValue = today?.spentUsd ?? 0;

			totalToday += todayValue;
			totalMonth += month;
			if (today) {
				earliestStart = earliestStart === null ? today.startAt : Math.min(earliestStart, today.startAt);
			}

			todayBits.push(`${r.name} ~${await this.formatMoney(todayValue, targetCurrency, symbol)}${today?.manual ? ' ✍️' : ''}`);
			monthBits.push(`${r.name} ~${await this.formatMoney(month, targetCurrency, symbol)}`);
		}

		const sinceNote = earliestStart
			? `pierwszy odczyt dnia: ${new Date(earliestStart).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`
			: 'oczekiwanie na pierwszy odczyt dnia';

		const cards = `<div class="grid usage">
			<div class="card"><div class="label">Dziś · koszt</div><div class="value">~${await this.formatMoney(totalToday, targetCurrency, symbol)}</div>
				<div class="extra">${escapeHtml(todayBits.join(' · '))}<br>${escapeHtml(sinceNote)}</div></div>
			<div class="card"><div class="label">${escapeHtml(monthLabel)} · koszt</div><div class="value">~${await this.formatMoney(totalMonth, targetCurrency, symbol)}</div>
				<div class="extra">${escapeHtml(monthBits.join(' · '))}</div></div>
		</div>`;

		const series = this.costTracker.getRecentDays(30);
		const chartPoints = series.map((p) => ({
			label: Number(p.label),
			value: p.total,
			tip: `${p.label}.${p.date.slice(5, 7)} — ~$${p.total.toFixed(4)}`
		}));
		const maxCost = Math.max(...chartPoints.map((p) => p.value), 0);
		const chart = `<div class="card chartCard"><div class="chart-title"><span>Koszt / dzień (ostatnie 30 dni)</span><span>max ${formatUsdAmount(maxCost)}</span></div>
			${DashboardPanel.barChart(chartPoints, '#d4a017')}</div>`;

		const days = this.costTracker.getRecentDays(14).reverse(); // newest first
		const providerCols = tracked.map((r) => `<th class="num">${escapeHtml(r.name)}</th>`).join('');
		const rows = days
			.map((day) => {
				const cells = tracked
					.map((r) => {
						const value = day.byProvider[r.key];
						return `<td class="num">${value !== undefined ? formatUsdAmount(value) : '—'}</td>`;
					})
					.join('');
				return `<tr><td>${day.date}</td>${cells}<td class="num"><b>${formatUsdAmount(day.total)}</b></td></tr>`;
			})
			.join('');
		const table = `<div class="card chartCard"><div class="chart-title"><span>Ostatnie 14 dni</span></div>
			<table><thead><tr><th>Data</th>${providerCols}<th class="num">Razem</th></tr></thead><tbody>${rows}</tbody></table></div>`;

		const cfg = vscode.workspace.getConfiguration('aiBalance');
		const sharedPath = cfg.get<string>('dailyCosts.sharedFilePath', '').trim();
		const remoteEnabled =
			!!cfg.get<string>('dailyCosts.remoteUrl', '').trim() &&
			!!cfg.get<string>('dailyCosts.remoteToken', '').trim();
		const targets: string[] = [];
		if (remoteEnabled) {
			targets.push('webitcache');
		}
		if (sharedPath) {
			targets.push(sharedPath);
		}
		const syncNote =
			targets.length > 0
				? `<div class="notice">🔗 Synchronizacja: <code>${escapeHtml(targets.join(' + '))}</code> — najniższe saldo dnia i najwcześniejszy start wygrywają, więc wszystkie maszyny widzą ten sam dzienny koszt.</div>`
				: `<div class="notice">💡 Skonfiguruj <code>aiBalance.dailyCosts.remoteToken</code> (webitcache) lub wspólny plik OneDrive/Dropbox, aby wszystkie komputery widziały ten sam dzienny koszt.</div>`;

		return cards + chart + table + syncNote;
	}

	private peakCard(): string {
		const isPeak = isDeepSeekPeakHours();
		const isWeekend = isDeepSeekWeekend();
		const transition = getNextPeakTransition();
		const countdown = formatCountdown(transition.minutes);
		const target = formatTransitionTarget(transition.at);

		const badge = isPeak
			? '🔴 PEAK HOURS — cena 2×'
			: isWeekend
				? '🟢 Weekend — cały dzień off-peak'
				: '🟢 Standardowa cena (off-peak)';
		const nextText =
			transition.next === 'peak'
				? `Do peak hours: ${countdown} (${target})`
				: `Do końca peak (off-peak): ${countdown} (${target})`;

		const items = getPeakHoursDescription()
			.split('\n')
			.slice(1)
			.map((line) => `<li>${escapeHtml(line)}</li>`)
			.join('');

		return `<div class="card peak">
			<div>
				<div class="badge">${badge}</div>
				<div class="countdown" style="color: ${isPeak ? '#e05252' : '#d4a017'}">${countdown}</div>
				<div class="extra">${nextText}</div>
			</div>
			<ul class="peak-list">${items}</ul>
		</div>`;
	}

	private static barChart(points: Array<{ label: number; value: number; tip: string }>, color: string): string {
		const width = 720;
		const height = 150;
		const padTop = 14;
		const baseline = 126;
		const barGap = 3;
		const n = Math.max(points.length, 1);
		const slot = (width - 16) / n;
		const barW = Math.max(slot - barGap, 2);
		const max = Math.max(...points.map((p) => p.value), 0);
		const step = Math.max(1, Math.ceil(n / 12));

		let bars = '';
		let labels = '';
		points.forEach((p, i) => {
			const h = max > 0 ? (p.value / max) * (baseline - padTop) : 0;
			const x = 8 + i * slot + (slot - barW) / 2;
			const y = baseline - h;
			const rectH = p.value > 0 ? Math.max(h, 2) : 1;
			bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${rectH.toFixed(1)}" rx="2" fill="${color}" fill-opacity="${p.value > 0 ? 0.95 : 0.25}"><title>${escapeHtml(p.tip)}</title></rect>`;
			if (i % step === 0 || i === n - 1) {
				labels += `<text x="${(x + barW / 2).toFixed(1)}" y="${baseline + 15}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55">${p.label}</text>`;
			}
		});

		return `<svg viewBox="0 0 ${width} ${height}" role="img">
			<line x1="8" y1="${baseline}" x2="${width - 8}" y2="${baseline}" stroke="currentColor" stroke-opacity="0.25"/>
			${bars}${labels}</svg>`;
	}

	private static monthLabel(date: Date): string {
		const label = date.toLocaleDateString('pl-PL', { month: 'long' });
		return label.charAt(0).toUpperCase() + label.slice(1);
	}

	/** Inline Lucide icons (MIT) for the footer buttons. */
	private static icon(name: 'refresh' | 'pencil' | 'settings'): string {
		const paths: Record<string, string> = {
			refresh:
				'<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
			pencil:
				'<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
			settings:
				'<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'
		};
		return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
	}

	private shell(body: string): string {
		return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
	:root { color-scheme: light dark; }
	body {
		font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
		padding: 22px 26px 30px;
		color: var(--vscode-foreground);
		background: var(--vscode-editor-background);
		line-height: 1.45;
	}
	h1 { font-size: 21px; margin: 0 0 2px; font-weight: 600; }
	h1 .tag {
		font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em;
		background: linear-gradient(135deg, #d4a017, #b5820e); color: #1e1e1e;
		border-radius: 20px; padding: 3px 10px; vertical-align: middle; margin-left: 8px;
	}
	.sub { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 4px; }
	section h2 {
		font-size: 12px; text-transform: uppercase; letter-spacing: .1em; font-weight: 600;
		color: var(--vscode-descriptionForeground); margin: 26px 0 10px;
		border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,.2));
		padding-bottom: 6px;
	}
	.grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
	.card {
		background: var(--vscode-editorWidget-background, rgba(128,128,128,.07));
		border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.22));
		border-radius: 10px; padding: 13px 15px; margin-bottom: 12px;
	}
	.grid .card { margin-bottom: 0; }
	.card .label {
		font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
		color: var(--vscode-descriptionForeground); margin-bottom: 6px;
	}
	.card .value { font-size: 21px; font-weight: 600; font-variant-numeric: tabular-nums; }
	.card .extra { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
	.chartCard { padding: 14px 16px 10px; }
	.chart-title {
		font-size: 12px; display: flex; justify-content: space-between; gap: 10px;
		color: var(--vscode-descriptionForeground); margin-bottom: 6px;
	}
	.chartCard svg { width: 100%; height: auto; display: block; }
	table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
	th, td { text-align: left; padding: 7px 10px; font-size: 13px; border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,.18)); }
	th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--vscode-descriptionForeground); font-weight: 600; }
	tbody tr:hover td { background: rgba(128,128,128,.08); }
	td.num, th.num { text-align: right; }
	.notice {
		border: 1px dashed var(--vscode-widget-border, rgba(128,128,128,.35));
		border-radius: 10px; padding: 14px 16px; font-size: 13px;
		color: var(--vscode-descriptionForeground); margin-bottom: 12px;
	}
	.notice.warn { border-color: #d4a017; color: var(--vscode-foreground); }
	.notice code {
		background: rgba(128,128,128,.15); border-radius: 4px; padding: 1px 5px;
		font-family: Consolas, monospace; font-size: 12px;
	}
	.peak { display: grid; grid-template-columns: 230px 1fr; gap: 18px; align-items: center; }
	.peak .badge { font-size: 14px; font-weight: 600; }
	.peak .countdown { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 2px 0; }
	.peak-list { margin: 0; padding-left: 18px; font-size: 13px; color: var(--vscode-descriptionForeground); }
	.peak-list li { margin: 3px 0; }
	.footer { margin-top: 24px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
	.btn {
		display: inline-flex; align-items: center; gap: 7px;
		padding: 7px 16px; border-radius: 6px; font-size: 13px; line-height: 1;
		text-decoration: none; background: var(--vscode-button-background); color: var(--vscode-button-foreground);
	}
	.btn svg { width: .75em; height: .75em; flex: 0 0 auto; display: inline-block; }
	.btn:hover { background: var(--vscode-button-hoverBackground); }
	.btn.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
	.btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
	@media (max-width: 640px) { .peak { grid-template-columns: 1fr; } }
</style>
</head>
<body>
${body}
</body>
</html>`;
	}

	dispose(): void {
		DashboardPanel.currentPanel = undefined;
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
			this.refreshTimer = undefined;
		}
		this.panel.dispose();
		while (this.disposables.length) {
			const d = this.disposables.pop();
			d?.dispose();
		}
	}
}
