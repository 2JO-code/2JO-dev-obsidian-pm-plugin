import { describe, expect, it } from 'vitest';
import { OPENED_BY_PLUGIN, resolveViewState, viewMemoryKey } from './viewMemory';

describe('resolveViewState', () => {
	const stored = { filter: { projects: ['PJT-1'] }, gridLines: false };

	it('Obsidian が戻す状態（ほかの人の workspace.json かもしれない）より、このPCに覚えた状態を使う', () => {
		const incoming = { filter: { projects: ['PJT-9'] }, gridLines: true };
		expect(resolveViewState(incoming, stored)).toEqual({ state: stored, remember: false });
	});

	it('このPCに何も覚えていなければ、戻された状態を使う', () => {
		const incoming = { gridLines: false };
		expect(resolveViewState(incoming, null)).toEqual({ state: incoming, remember: false });
		expect(resolveViewState(undefined, undefined)).toEqual({ state: undefined, remember: false });
	});

	it('プラグインが開いたときは、覚えた状態に渡した項目を重ね、印は除いて覚え直す', () => {
		const incoming = { project: 'PJT-2', [OPENED_BY_PLUGIN]: true };
		expect(resolveViewState(incoming, stored)).toEqual({
			state: { filter: { projects: ['PJT-1'] }, gridLines: false, project: 'PJT-2' },
			remember: true,
		});
	});

	it('プラグインが開いたときに覚えた状態が無ければ、渡した項目だけを使う', () => {
		expect(resolveViewState({ project: 'PJT-2', [OPENED_BY_PLUGIN]: true }, null)).toEqual({
			state: { project: 'PJT-2' },
			remember: true,
		});
	});
});

describe('viewMemoryKey', () => {
	it('ビューの種類ごとに別の名前にする', () => {
		expect(viewMemoryKey('pm-task-list')).toBe('project-manager:view:pm-task-list');
	});
});
