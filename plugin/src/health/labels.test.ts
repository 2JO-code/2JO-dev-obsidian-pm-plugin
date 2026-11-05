import { describe, expect, it } from 'vitest';
import { buildNote, type NoteSource } from '../store/buildNote';
import { VaultIndex } from '../store/vaultIndex';
import { labelOf } from './labels';

const U = (n: number) => `0192f3a0-1234-7abc-8def-${String(n).padStart(12, '0')}`;
const USER = `USER-${U(1)}`;
const TASK = `TASK-${U(2)}`;

function indexOf(...sources: NoteSource[]): VaultIndex {
	const index = new VaultIndex();
	for (const src of sources) {
		const r = buildNote(src);
		if (r) index.set(r);
	}
	return index;
}

const member: NoteSource = {
	path: `Members/${USER}.md`,
	basename: USER,
	frontmatter: { type: 'user', title: '山田 太郎', aliases: ['山田 太郎'], daily_hours: 8, load_limit_pct: 120, active: true },
};

describe('labelOf', () => {
	it('ノートのタイトルと種類', () => {
		const index = indexOf(member);
		expect(labelOf(`Members/${USER}.md`, index)).toEqual({ type: 'user', typeLabel: 'メンバー', title: '山田 太郎' });
	});

	it('必須項目が欠けて読めなかったノートも、frontmatter の title を使う', () => {
		const index = indexOf({ path: `Tasks/${TASK}.md`, basename: TASK, frontmatter: { type: 'task', title: '誤りのあるタスク' } });
		expect(labelOf(`Tasks/${TASK}.md`, index).title).toBe('誤りのあるタスク');
	});

	it('作業ログはメンバー名と月で表す。メンバーが見つからなければID', () => {
		const log = `Members/Logs/${USER}_2026-11.md`;
		expect(labelOf(log, indexOf(member)).title).toBe('山田 太郎の作業ログ（2026-11）');
		expect(labelOf(log, indexOf()).title).toBe(`${USER}の作業ログ（2026-11）`);
	});

	it('frontmatter が読めないノートや、ノートでないファイルはファイル名', () => {
		const index = indexOf({ path: `Tasks/${TASK}.md`, basename: TASK, frontmatter: undefined });
		expect(labelOf(`Tasks/${TASK}.md`, index)).toEqual({ type: 'task', typeLabel: 'タスク', title: TASK });
		expect(labelOf('_pm/statuses.json', index)).toEqual({ title: 'statuses.json' });
	});
});
