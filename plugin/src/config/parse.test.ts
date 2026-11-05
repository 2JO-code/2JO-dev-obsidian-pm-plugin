import { describe, expect, it } from 'vitest';
import { defaultCalendar, defaultStatusSets } from './defaults';
import { parseCalendar, parseStatusSets, stringifyCalendar, stringifyStatusSets } from './parse';

describe('parseStatusSets', () => {
	it('書き出したものを読み直すと同じ内容になる', () => {
		const sets = defaultStatusSets();
		expect(parseStatusSets(stringifyStatusSets(sets))).toEqual({ value: sets, problems: [] });
	});

	it('JSONとして読めないときは初期値を使い、理由を返す', () => {
		const result = parseStatusSets('<<<<<<< .mine\n{}');
		expect(result.value).toEqual(defaultStatusSets());
		expect(result.problems[0]).toMatch(/JSONとして読めません/);
	});

	it('不正なステータスだけを除き、残りは使う', () => {
		const text = JSON.stringify({
			task: [
				{ name: '未着手', category: 'not_started' },
				{ name: '謎', category: 'unknown' },
				{ category: 'done' },
			],
			project: [{ name: '進行中', category: 'in_progress', aliases: ['実施中'] }],
		});
		const result = parseStatusSets(text);
		expect(result.value.task).toEqual([{ name: '未着手', category: 'not_started', aliases: [] }]);
		expect(result.value.project).toEqual([{ name: '進行中', category: 'in_progress', aliases: ['実施中'] }]);
		expect(result.problems).toHaveLength(2);
	});

	it('片方のセットが無いときはそのセットだけ初期値を使う', () => {
		const result = parseStatusSets(JSON.stringify({ task: [{ name: 'A', category: 'done' }] }));
		expect(result.value.task).toEqual([{ name: 'A', category: 'done', aliases: [] }]);
		expect(result.value.project).toEqual(defaultStatusSets().project);
		expect(result.problems).toHaveLength(1);
	});

	it('名前と旧名の重複を警告する', () => {
		const text = JSON.stringify({
			task: [
				{ name: 'A', category: 'done', aliases: ['B'] },
				{ name: 'B', category: 'done' },
			],
			project: defaultStatusSets().project,
		});
		expect(parseStatusSets(text).problems).toEqual(['タスク・エピック用の2番目: 「B」が重複しています']);
	});
});

describe('parseCalendar', () => {
	it('書き出したものを読み直すと同じ内容になり、休日は日付順に並ぶ', () => {
		const calendar = {
			weekendsOff: false,
			holidays: [
				{ date: '2027-01-01', name: '元日' },
				{ date: '2026-12-31', name: '年末休暇' },
			],
		};
		const result = parseCalendar(stringifyCalendar(calendar));
		expect(result.problems).toEqual([]);
		expect(result.value.weekendsOff).toBe(false);
		expect(result.value.holidays.map((h) => h.date)).toEqual(['2026-12-31', '2027-01-01']);
	});

	it('不正な休日を除いて警告する', () => {
		const text = JSON.stringify({ weekendsOff: true, holidays: [{ date: '2026/12/31' }, { date: '2026-12-30' }] });
		const result = parseCalendar(text);
		expect(result.value.holidays).toEqual([{ date: '2026-12-30', name: '' }]);
		expect(result.problems).toHaveLength(1);
	});

	it('読めないときは初期値を使う', () => {
		expect(parseCalendar('').value).toEqual(defaultCalendar());
	});
});

describe('stringify', () => {
	it('2スペースのインデントと末尾の改行で固定する', () => {
		const text = stringifyCalendar(defaultCalendar());
		expect(text).toBe('{\n  "weekendsOff": true,\n  "holidays": []\n}\n');
	});
});
