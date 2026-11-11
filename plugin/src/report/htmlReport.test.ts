import { describe, expect, it } from 'vitest';
import { buildContext } from '../calc/context';
import { epic, EPIC, indexOf, member, PJT, PJT2, project, task, USER, worklog } from '../calc/testData';
import { defaultCalendar, defaultStatusSets } from '../config/defaults';
import { CATEGORY_COLORS } from '../config/statusColor';
import { buildHtmlReport, escapeHtml } from './htmlReport';

const index = indexOf([
	project(PJT, {
		title: 'A<案件>',
		manager: USER,
		milestones: [{ line: 1, name: '納品', date: '2026-11-10', epic: EPIC }],
		allocations: [{ line: 2, month: '2026-11', member: USER, hours: 10 }],
	}),
	project(PJT2, { title: 'B案件', status: '謎' }),
	member(USER, { title: '佐藤' }),
	epic(EPIC, { title: '設計', wbs: '1' }),
	task('T1', { epic: EPIC, due: '2026-11-02' }),
	worklog(USER, '2026-11', [['2026-11-04', 'T1', 12, 3]]),
]);
const ctx = buildContext(index, defaultStatusSets(), defaultCalendar(), '2026-11-04');
const html = buildHtmlReport(ctx, {
	projects: index.projects(),
	members: index.members(),
	displayName: 'title',
	generatedAt: '2026-11-04 09:30',
	colors: { project: '#112233', epic: '#445566', task: '#778899' },
	statusColors: { task: { 進行中: '#abcdef' }, project: {} },
});

describe('escapeHtml', () => {
	it('HTML の記号を置き換える', () => {
		expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
	});
});

describe('buildHtmlReport', () => {
	it('1つのファイルで開けるよう CSS を中に入れ、作成日時を出す', () => {
		expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
		expect(html).toContain('<style>');
		expect(html).toContain('作成日時 2026-11-04 09:30（基準日 2026-11-04）');
	});

	it('全プロジェクトの表から各プロジェクトの節へリンクする。名前はエスケープする', () => {
		expect(html).toContain('<span class="kind project"></span><a href="#p-PJT-1">A&lt;案件&gt;</a>');
		expect(html).toContain('<section id="p-PJT-1"><h2><span class="kind project"></span>A&lt;案件&gt;</h2>');
		expect(html).toContain('<section id="p-PJT-2"><h2><span class="kind project"></span>B案件</h2>');
		expect(html).not.toContain('A<案件>');
	});

	it('プロジェクトの節にマイルストーン・エピック・配分表を入れる', () => {
		const section = html.slice(html.indexOf('<section id="p-PJT-1">'), html.indexOf('<section id="p-PJT-2">'));
		expect(section).toContain('<dd>佐藤</dd>');
		expect(section).toContain('<td>納品</td>');
		expect(section).toContain('<td><span class="kind epic"></span>設計</td>');
		// 予定12h が配分10h を超えている
		expect(section).toContain('<td class="num error">12</td>');
		expect(section).toContain('<span class="badge overdue">期限超過 1</span>');
	});

	it('種類の色は設定の色を CSS に入れる', () => {
		expect(html).toContain('.kind.project { background: #112233; }');
		expect(html).toContain('.kind.epic { background: #445566; }');
	});

	it('ステータスは色の枠で囲む。選んだ色、なければ分類の色。設定に無いものは注意の色の文字', () => {
		const section = html.slice(html.indexOf('<section id="p-PJT-1">'), html.indexOf('<section id="p-PJT-2">'));
		// エピック（タスク・エピック用）は選んだ色、プロジェクトは分類（進行中系）の色
		expect(section).toContain(`<td><span class="status" style="--c:#abcdef">進行中</span></td>`);
		expect(section).toContain(`<dd><span class="status" style="--c:${CATEGORY_COLORS.in_progress}">進行中</span></dd>`);
		expect(html).toContain('<td class="warning">謎</td>');
		expect(html).toContain('<dd class="warning">謎</dd>');
	});

	it('進捗率は横棒と件数（棒・％・件数を分けて位置をそろえる）', () => {
		expect(html).toContain('<span class="progress"><span class="bar"><span style="width:0%"></span></span><span class="pct">0%</span><span>（0/1）</span></span>');
	});

	it('メンバー全員の今週・今月（配分・予定・実績）と来月（配分・予定）の負荷率', () => {
		expect(html).toContain('<h3>メンバーの負荷率（1 人）</h3>');
		expect(html).toContain('<th class="num">今週 配分</th>');
		expect(html).toContain('<th class="num">来月 予定</th>');
		expect(html).not.toContain('来月 実績');
		// 今週（11/2〜8）は稼働5日＝40h。予定 12h で30%
		expect(html).toContain('<td class="num load-normal"><span title="予定 12h／基準 40h">30%</span></td>');
		// 配分 10h を11月の稼働21日で按分。今週は5日分
		expect(html).toContain('<span title="配分 2.38h／基準 40h">6%</span>');
	});
});
