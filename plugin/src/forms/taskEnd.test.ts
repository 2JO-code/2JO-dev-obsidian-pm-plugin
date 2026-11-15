import { describe, expect, it } from 'vitest';
import { defaultStatusSets } from '../config/defaults';
import { endChangeForStatus, endConfirmText } from './taskEnd';

const statuses = defaultStatusSets().task;
const TODAY = '2026-11-15';
const run = (from: string, to: string, end?: string) => endChangeForStatus(from, to, end, statuses, TODAY);

describe('endChangeForStatus', () => {
	it('完了系にするときは、今日にするかを聞く（今の終了日も添える）', () => {
		expect(run('進行中', '完了')).toEqual({ kind: 'ask', today: TODAY });
		expect(run('進行中', '完了', '2026-11-10')).toEqual({ kind: 'ask', today: TODAY, current: '2026-11-10' });
		expect(run('設定に無い', '完了')).toEqual({ kind: 'ask', today: TODAY });
	});

	it('もう今日なら聞かない。完了系どうしの移動でも聞かない', () => {
		expect(run('進行中', '完了', TODAY)).toEqual({ kind: 'keep' });
		const twoDone = [...statuses, { name: '検収済み', category: 'done' as const, aliases: [] }];
		expect(endChangeForStatus('完了', '検収済み', undefined, twoDone, TODAY)).toEqual({ kind: 'keep' });
	});

	it('完了系から外しても終了日は変えない', () => {
		expect(run('完了', '進行中', '2026-11-10')).toEqual({ kind: 'keep' });
		expect(run('完了', '進行中')).toEqual({ kind: 'keep' });
		expect(run('未着手', '保留')).toEqual({ kind: 'keep' });
	});
});

describe('endConfirmText', () => {
	it('今の終了日と今日を日付と曜日で出す', () => {
		expect(endConfirmText({ today: TODAY, current: '2026-11-10' }, '設計').details).toEqual([
			'「設計」を完了にします',
			'今の終了日は 11/10(火) です',
			'「今日にする」で終了日を 11/15(日) にします',
			'「変えない」なら終了日はそのままです。あとでフォームで直せます',
		]);
		expect(endConfirmText({ today: TODAY }, '設計').details[1]).toBe('終了日はまだ空です');
	});
});
