import { compareJa, compareNumeric } from '../calc/compare';
import type { CalcContext } from '../calc/context';
import { dashboard, MILESTONE_DAYS } from '../calc/dashboard';
import { LOAD_MODE_LABEL, loadValue, type LoadMode, type MemberLoad } from '../calc/load';
import { cellKey, type ProjectStatus } from '../calc/projectStatus';
import { isFinished } from '../config/status';
import { statusColor } from '../config/statusColor';
import type { Member, NoteId, Project, StatusSets } from '../model';
import { cleanColor, DEFAULT_SETTINGS, type KindColors, projectLabel, type ProjectDisplayName, type StatusColors } from '../settings';
import { WARNING_LABELS, type Warning } from '../calc/warnings';
import { countText, hoursText, pct, rateText, warningCounts, warningSummary } from '../calc/format';

/** HTMLレポートのファイル名（出力先のフォルダに上書きする。設計書 13章） */
export const REPORT_FILE_NAME = 'project-report.html';

export interface ReportInput {
	/** 載せるプロジェクト（クローズしていないもの） */
	projects: readonly Project[];
	/** 負荷を見るメンバー（在籍者） */
	members: readonly Member[];
	displayName: ProjectDisplayName;
	/** 作成日時（`YYYY-MM-DD HH:MM`） */
	generatedAt: string;
	/** 種類ごとの色（画面と同じ設定） */
	colors: KindColors;
	/** ステータスごとに選んだ色（画面と同じ設定） */
	statusColors: StatusColors;
}

type StatusCell = (set: keyof StatusSets, value: string) => Cell;

/** 文字を HTML に入れられる形にする */
export function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

const e = escapeHtml;
const anchor = (id: NoteId) => `p-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
const period = (p: { start?: string; due?: string }) => (p.start || p.due ? `${p.start ?? '?'} 〜 ${p.due ?? '?'}` : '—');
interface Cell {
	text: string;
	cls?: string;
	/** 中身をそのまま入れる（組み立て済みの HTML） */
	html?: boolean;
}

const cell = (text: string, cls?: string): Cell => ({ text, ...(cls ? { cls } : {}) });

/** 種類の色の印（画面と同じ。設計書 9.1） */
const kind = (k: keyof KindColors) => `<span class="kind ${k}"></span>`;

/** ステータスを色の枠で囲む（画面と同じ。設計書 9.1）。設定に無いステータスは注意の色の文字 */
function statusCells(ctx: CalcContext, colors: StatusColors): StatusCell {
	return (set, value) => {
		if (value === '') return cell('');
		// 色は style に入れるので、形を確かめてから使う
		const color = cleanColor(statusColor(ctx.statuses[set], colors[set], value));
		return color ? { text: `<span class="status" style="--c:${color}">${e(value)}</span>`, html: true } : cell(value, 'warning');
	};
}

/** 進捗率の横棒と文字（画面と同じ。設計書 9.1） */
function progressCell(s: { progress: ProjectStatus['progress'] }): Cell {
	const { ratio } = s.progress;
	const bar = ratio === null ? '' : `<span class="bar"><span style="width:${Math.round(ratio * 100)}%"></span></span>`;
	return { text: `<span class="progress">${bar}<span class="pct">${e(pct(s.progress))}</span><span>${e(countText(s.progress))}</span></span>`, html: true };
}

/** 警告の種類ごとの印（画面と同じ。設計書 9.1） */
function badges(warnings: readonly Warning[]): Cell {
	return { text: warningCounts(warnings).map(([kind, n]) => `<span class="badge ${kind}">${e(WARNING_LABELS[kind])} ${n}</span>`).join(''), html: true };
}

function table(headers: string[], rows: Cell[][], numeric: number[] = []): string {
	const th = headers.map((h, i) => `<th${numeric.includes(i) ? ' class="num"' : ''}>${e(h)}</th>`).join('');
	const body = rows
		.map((r) => `<tr>${r.map((c, i) => {
			const cls = [numeric.includes(i) ? 'num' : '', c.cls ?? ''].filter(Boolean).join(' ');
			return `<td${cls ? ` class="${cls}"` : ''}>${c.html ? c.text : e(c.text)}</td>`;
		}).join('')}</tr>`)
		.join('\n');
	return `<table><thead><tr>${th}</tr></thead><tbody>\n${body}\n</tbody></table>`;
}

const empty = (text: string) => `<p class="empty">${e(text)}</p>`;

/**
 * HTMLレポート（要件4.10、設計書 13章）。ダッシュボードと各プロジェクトの状況を1つのファイルにする。
 * CSS も中に入れ、ほかのファイルが無くても開けるようにする
 */
export function buildHtmlReport(ctx: CalcContext, input: ReportInput): string {
	const label = (p: Project) => projectLabel(p, input.displayName);
	const projects = [...input.projects].sort((a, b) => compareNumeric(label(a), label(b)));
	const data = dashboard(ctx, projects, input.members);
	const names = new Map(ctx.index.members().map((m) => [m.id, m.title]));
	const name = (id: NoteId) => names.get(id) ?? id;
	const status = statusCells(ctx, input.statusColors);

	const parts: string[] = [];
	parts.push(`<header><h1>プロジェクト状況レポート</h1><p class="meta">作成日時 ${e(input.generatedAt)}（基準日 ${e(ctx.today)}）</p></header>`);

	// ダッシュボード
	parts.push('<section><h2>全プロジェクト</h2>');
	parts.push(
		data.projects.length === 0
			? empty('クローズしていないプロジェクトはありません')
			: table(
					['プロジェクト', 'ステータス', '期間', '見込み終了', '進捗率', '見積(h)', '予定(h)', '実績(h)', '警告'],
					data.projects.map((s) => {
						const late = !!s.span && !!s.project.due && s.span.end > s.project.due;
						return [
							{ text: `${kind('project')}<a href="#${anchor(s.project.id)}">${e(label(s.project))}</a>`, html: true },
							status('project', s.project.status),
							cell(period(s.project)),
							cell(s.span?.end ?? '—', late ? 'error' : undefined),
							progressCell(s),
							cell(hoursText(s.workload.estimate)),
							cell(hoursText(s.workload.planned)),
							cell(hoursText(s.workload.actual)),
							badges(s.warnings),
						];
					}),
					[4, 5, 6, 7],
				),
	);

	const first = data.members[0];
	parts.push(`<h3>メンバーの負荷率（${data.members.length} 人）</h3>`);
	parts.push(
		!first
			? empty('在籍しているメンバーはいません')
			: `<p class="note">今週＝${first.week.period.start}〜${first.week.period.end}、今月＝${first.month.period.key}、来月＝${first.nextMonth.period.key}</p>` +
					table(
						['メンバー', ...LOAD_COLUMNS.map(([p, m]) => `${PERIOD_LABEL[p]} ${LOAD_MODE_LABEL[m]}`)],
						data.members.map((row) => [cell(row.member.title), ...LOAD_COLUMNS.map(([p, m]) => loadCell(row[p], m))]),
						LOAD_COLUMNS.map((_, i) => i + 1),
					) +
					'<p class="note">負荷率＝配分・予定・実績の時間 ÷ 基準工数（稼働日数 × 1日の通常稼働時間）。注意＝100%超、警告＝負荷許容率超。数字にマウスを乗せると時間が出ます</p>',
	);

	parts.push(`<h3>${MILESTONE_DAYS / 7}週間以内のマイルストーン（${data.milestones.length} 件）</h3>`);
	parts.push(
		data.milestones.length === 0
			? empty('ありません')
			: table(
					['日付', 'プロジェクト', '名前', '連動エピック', '注意'],
					data.milestones.map((m) => [
						cell(m.milestone.date),
						cell(label(m.project)),
						cell(m.milestone.name),
						cell(m.epic?.epic ? `${m.epic.epic.title}（${m.epic.epic.status}・${pct(m.epic.progress)}）` : (m.milestone.epic ?? '')),
						cell(m.notes.join('・'), 'error'),
					]),
				),
	);
	parts.push('</section>');

	// プロジェクトごと
	for (const s of data.projects) parts.push(projectSection(s, label(s.project), name, status));

	return page(parts.join('\n'), input.colors);
}

const PERIOD_LABEL = { week: '今週', month: '今月', nextMonth: '来月' } as const;

/** 負荷の表の列：期間 × 配分・予定・実績（来月は実績なし。要件4.8b） */
const LOAD_COLUMNS: readonly [keyof typeof PERIOD_LABEL, LoadMode][] = [
	['week', 'allocated'],
	['week', 'planned'],
	['week', 'actual'],
	['month', 'allocated'],
	['month', 'planned'],
	['month', 'actual'],
	['nextMonth', 'allocated'],
	['nextMonth', 'planned'],
];

function loadCell(load: MemberLoad, mode: LoadMode): Cell {
	const v = loadValue(load, mode);
	const title = `${LOAD_MODE_LABEL[mode]} ${hoursText(v.hours)}h／基準 ${hoursText(load.base)}h`;
	return { text: `<span title="${e(title)}">${e(rateText(v.rate))}</span>`, html: true, cls: `load-${v.level}` };
}

function projectSection(s: ProjectStatus, title: string, name: (id: NoteId) => string, status: StatusCell): string {
	const { project } = s;
	const late = !!s.span && !!project.due && s.span.end > project.due;
	const projectStatus = status('project', project.status);
	const summary: [string, string | Cell, string?][] = [
		['簡易プロジェクト名', project.title],
		['正式名称', project.officialName || '—'],
		['案件ID', project.caseId || '—'],
		['ステータス', project.status ? projectStatus : '—', projectStatus.cls],
		['責任者', project.manager ? name(project.manager) : '—'],
		['期間', period(project)],
		['見込みの期間', s.span ? `${s.span.start} 〜 ${s.span.end}${late ? '（期限日より後に終わる見込み）' : ''}` : '—', late ? 'error' : undefined],
		['進捗率', s.progress.ratio === null ? '対象のタスクなし' : `${pct(s.progress)}（完了 ${s.progress.done} ／ 対象 ${s.progress.total} 件）`],
		['工数', `見積 ${hoursText(s.workload.estimate)}h ／ 予定 ${hoursText(s.workload.planned)}h ／ 実績 ${hoursText(s.workload.actual)}h`],
		['警告', s.warnings.length === 0 ? 'なし' : `${s.warnings.length} 件（${warningSummary(s.warnings)}）`, s.warnings.length > 0 ? 'error' : undefined],
	];
	const parts: string[] = [];
	parts.push(`<section id="${anchor(project.id)}"><h2>${kind('project')}${e(title)}</h2>`);
	const value = (v: string | Cell) => (typeof v === 'string' ? e(v) : v.html ? v.text : e(v.text));
	parts.push(`<dl>${summary.map(([k, v, cls]) => `<dt>${e(k)}</dt><dd${cls ? ` class="${cls}"` : ''}>${value(v)}</dd>`).join('')}</dl>`);

	parts.push('<h3>マイルストーン</h3>');
	parts.push(
		s.milestones.length === 0
			? empty('マイルストーンはありません')
			: table(
					['日付', '名前', '連動エピック', 'エピックの状況', '期限日', '注意'],
					s.milestones.map((m) => [
						cell(m.milestone.date),
						cell(m.milestone.name),
						cell(m.epic?.epic ? m.epic.epic.title : (m.milestone.epic ?? '')),
						cell(m.epic?.epic ? `${m.epic.epic.status}・${pct(m.epic.progress)}` : ''),
						cell(m.epic?.epic?.due ?? ''),
						cell(m.notes.join('・'), 'error'),
					]),
				),
	);

	parts.push('<h3>エピック</h3>');
	parts.push(
		s.epics.length === 0
			? empty('エピック・タスクはありません')
			: table(
					['WBS', 'タイトル', 'ステータス', '担当者', '進捗', '見積(h)', '予定(h)', '実績(h)', '見込み開始', '見込み終了', '開始日', '期限日', '警告'],
					s.epics.map((r) => {
						const open = !isFinished(r.category);
						const endLate = open && !!r.span && !!r.epic?.due && r.span.end > r.epic.due;
						return [
							cell(r.epic?.wbs ?? ''),
							r.epic ? { text: `${kind('epic')}${e(r.epic.title)}`, html: true } : cell('（エピックなし）'),
							status('task', r.epic?.status ?? ''),
							cell(r.epic?.owner ? name(r.epic.owner) : ''),
							progressCell(r),
							cell(hoursText(r.workload.estimate)),
							cell(hoursText(r.workload.planned)),
							cell(hoursText(r.workload.actual)),
							cell(r.span?.start ?? '—'),
							cell(r.span?.end ?? '—', endLate ? 'error' : undefined),
							cell(r.epic?.start ?? ''),
							cell(r.epic?.due ?? ''),
							badges(r.warnings),
						];
					}),
					[4, 5, 6, 7],
				),
	);

	parts.push('<h3>工数配分</h3>');
	const { months, members, cells } = s.allocation;
	if (months.length === 0) {
		parts.push(empty('配分も作業ログもありません'));
	} else {
		const head = `<tr><th rowspan="2">メンバー</th>${months.map((m) => `<th colspan="3" class="month">${e(m)}</th>`).join('')}</tr>`;
		const sub = `<tr>${months.map(() => '<th class="num month">配分</th><th class="num">予定</th><th class="num">実績</th>').join('')}</tr>`;
		const rows = [...members]
			.sort((a, b) => compareJa(name(a), name(b)))
			.map((member) => {
				const tds = months.map((month) => {
					const c = cells.get(cellKey(member, month));
					const hours = c?.hours === undefined ? (c ? '—' : '') : hoursText(c.hours);
					return `<td class="num month">${e(hours)}</td><td class="num${c?.over ? ' error' : ''}">${c ? hoursText(c.planned) : ''}</td><td class="num">${c ? hoursText(c.actual) : ''}</td>`;
				});
				return `<tr><td>${e(name(member))}</td>${tds.join('')}</tr>`;
			});
		parts.push(`<table><thead>${head}${sub}</thead><tbody>\n${rows.join('\n')}\n</tbody></table>`);
		parts.push('<p class="note">予定・実績はこのプロジェクトのタスクに付けた作業ログの合計。赤は予定が配分を超えているもの。「—」は配分表に無い月・メンバー</p>');
	}
	parts.push('<p class="top"><a href="#">▲ 先頭へ</a></p></section>');
	return parts.join('\n');
}

/** ページの枠と、中に入れる CSS（印刷しても読めるよう白地にする） */
function page(body: string, colors: KindColors): string {
	// 色は CSS に入れるので、形を確かめてから使う
	const color = (k: keyof KindColors) => cleanColor(colors[k]) ?? DEFAULT_SETTINGS.colors[k];
	return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>プロジェクト状況レポート</title>
<style>
body { font-family: "Yu Gothic UI", "Meiryo", sans-serif; margin: 24px; color: #222; background: #fff; font-size: 14px; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 18px; margin: 32px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #4a6fa5; }
h3 { font-size: 15px; margin: 20px 0 6px; }
.meta, .note, .empty { color: #666; }
.note { font-size: 12px; }
table { border-collapse: collapse; margin: 4px 0; }
th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; vertical-align: top; }
th { background: #eef2f7; white-space: nowrap; }
.num { text-align: right; }
.month { border-left: 2px solid #999; }
th, th.num { text-align: center; }
.error { color: #c62828; }
.warning { color: #b85c00; }
.status { display: inline-block; padding: 0 8px; border: 1px solid var(--c); border-radius: 8px; background: color-mix(in srgb, var(--c) 16%, #fff); font-size: 12px; white-space: nowrap; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.load-normal { background: #e8f5e9; }
.load-caution { background: #fff3e0; }
.load-warning { background: #ffebee; color: #c62828; }
.progress { display: flex; align-items: center; }
.progress .bar { margin-right: 6px; }
.progress .pct { flex: none; min-width: 4.5ch; text-align: right; font-variant-numeric: tabular-nums; }
.progress > span:last-child { flex: 1; text-align: left; font-variant-numeric: tabular-nums; }
.bar { flex: none; display: inline-block; width: 60px; height: 6px; vertical-align: middle; border-radius: 3px; background: #e6e6e6; overflow: hidden; }
.bar > span { display: block; height: 100%; background: #2a78d6; }
.badge { display: inline-block; margin: 0 4px 2px 0; padding: 0 6px; border: 1px solid; border-radius: 4px; font-size: 12px; white-space: nowrap; }
.badge.overdue { background: #fdecec; border-color: #e34948; }
.badge.overdueRisk { background: #fdf0e8; border-color: #eb6834; }
.badge.overEstimate { background: #fdf5e0; border-color: #eda100; }
.badge.overAllocation, .badge.loadWarning, .badge.loadCaution, .badge.holidayWork { background: #efedfb; border-color: #6250d6; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 8px 0; }
dt { color: #666; }
dd { margin: 0; }
a { color: #1f5fa8; }
.top { font-size: 12px; }
.kind { display: inline-block; width: 8px; height: 8px; margin-right: 4px; border-radius: 50%; vertical-align: middle; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.kind.project { background: ${color('project')}; }
.kind.epic { background: ${color('epic')}; }
.kind.task { background: ${color('task')}; }
@media print { h2 { break-before: page; } section:first-of-type h2 { break-before: auto; } .top { display: none; } }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}
