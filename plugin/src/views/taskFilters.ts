import type { CalcContext } from '../calc/context';
import type { TaskFilterOptions } from '../calc/taskList';
import type { ProjectDisplayName } from '../settings';
import { epicChoices } from './choices';
import { dateRange, multiSelect } from './filterBar';
import { checkbox } from '../ui/controls';

/** タスクのビューだけの絞り込みの項目（エピック・期限日・警告ありのみ）。絞り込みの部品の extra に入れる */
export function taskFilterFields(
	bar: HTMLElement,
	ctx: CalcContext,
	projects: readonly string[],
	mode: ProjectDisplayName,
	options: TaskFilterOptions,
	onChange: (next: TaskFilterOptions) => void,
): void {
	const { epics, dueFrom, dueTo, warningsOnly } = options;
	const base = { epics, warningsOnly, ...(dueFrom ? { dueFrom } : {}), ...(dueTo ? { dueTo } : {}) };
	multiSelect(bar, 'エピック', epics, epicChoices(ctx, projects, mode), (next) => onChange({ ...base, epics: next }));
	dateRange(bar, '期限日', dueFrom, dueTo, (from, to) =>
		onChange({ epics, warningsOnly, ...(from ? { dueFrom: from } : {}), ...(to ? { dueTo: to } : {}) }),
	);
	checkbox(bar, '警告ありのみ', warningsOnly, (next) => onChange({ ...base, warningsOnly: next }));
}

/** base の絞り込みの項目を next に置き換える（期限日の空欄は消す） */
export function withTaskFilter<T extends TaskFilterOptions>(base: T, next: TaskFilterOptions): T {
	const copy = { ...base };
	delete copy.dueFrom;
	delete copy.dueTo;
	return { ...copy, ...next };
}
