import { describe, expect, it } from 'vitest';
import { sprint } from '../calc/testData';
import { emptySprintForm, sprintFormFromFrontmatter, sprintFormToUpdate, type SprintForm } from './sprintForm';

const U = (n: number) => `0192f3a0-1234-7abc-8def-${String(n).padStart(12, '0')}`;
const PJT = `PJT-${U(1)}`;
const PJT2 = `PJT-${U(2)}`;

const form = (overrides: Partial<SprintForm> = {}): SprintForm => ({
	title: 'スプリント 1',
	project: PJT,
	start: '2026-11-02',
	end: '2026-11-13',
	goal: '',
	...overrides,
});

describe('sprintFormFromFrontmatter', () => {
	it('frontmatter からフォームの値を作る', () => {
		expect(
			sprintFormFromFrontmatter({ title: 'スプリント 1', project: `[[${PJT}]]`, start: '2026-11-02', end: '2026-11-13', goal: ' 試作 ' }),
		).toEqual(form({ goal: '試作' }));
	});
});

describe('emptySprintForm', () => {
	it('スプリントが無ければ今日から2週間', () => {
		expect(emptySprintForm(PJT, [], '2026-11-26')).toEqual(form({ start: '2026-11-26', end: '2026-12-09' }));
	});

	it('最後のスプリントの翌日から同じ長さ。番号は同じプロジェクトの数の続き', () => {
		const sprints = [
			sprint('SPRINT-1', { project: PJT, start: '2026-11-02', end: '2026-11-06' }),
			sprint('SPRINT-2', { project: PJT, start: '2026-11-09', end: '2026-11-13' }),
			sprint('SPRINT-3', { project: PJT2, start: '2026-12-01', end: '2026-12-31' }),
		];
		expect(emptySprintForm(PJT, sprints, '2026-11-26')).toEqual(form({ title: 'スプリント 3', start: '2026-11-14', end: '2026-11-18' }));
	});

	it('プロジェクトが無ければ空', () => {
		expect(emptySprintForm('', [], '2026-11-26')).toEqual(form({ title: '', project: '', start: '', end: '' }));
	});
});

describe('sprintFormToUpdate', () => {
	it('決めた項目を書く。空のゴールは空の枠', () => {
		const result = sprintFormToUpdate(form(), []);
		expect(result.errors).toEqual([]);
		expect(result.update).toEqual({
			type: 'sprint',
			title: 'スプリント 1',
			aliases: ['スプリント 1'],
			project: `[[${PJT}]]`,
			start: '2026-11-02',
			end: '2026-11-13',
			goal: null,
		});
	});

	it('名前・プロジェクト・開始日・終了日は必須。終了日は開始日より後', () => {
		expect(sprintFormToUpdate(form({ title: ' ', project: '', start: '', end: '' }), []).errors).toEqual([
			'スプリント名を入力してください',
			'プロジェクトを選んでください',
			'開始日を入力してください',
			'終了日を入力してください',
		]);
		expect(sprintFormToUpdate(form({ end: '2026-11-01' }), []).errors).toEqual(['終了日が開始日より前になっています']);
	});

	it('同じプロジェクトのスプリントと期間が重なれば知らせる', () => {
		const others = [
			sprint('SPRINT-2', { title: '前', project: PJT, start: '2026-10-26', end: '2026-11-02' }),
			sprint('SPRINT-3', { title: '別', project: PJT2, start: '2026-11-02', end: '2026-11-13' }),
		];
		expect(sprintFormToUpdate(form(), others).warnings).toEqual(['期間が「前」と重なっています']);
	});

	it('タスクが入っていればプロジェクトは変えられない', () => {
		expect(sprintFormToUpdate(form({ project: PJT2 }), [], PJT).errors).toEqual(['タスクが入っているスプリントは、プロジェクトを変えられません']);
	});
});
