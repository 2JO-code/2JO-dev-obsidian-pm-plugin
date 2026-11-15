import { localToday } from '../calc/dates';
import { WorkCalendar } from '../calc/workdays';
import type ProjectManagerPlugin from '../main';
import type { TaskFormModalOptions } from '../ui/taskFormModal';

/** タスクのフォームの選択肢と計算に使う値（作るときも編集するときも同じ。設計書 4.4） */
export function taskFormChoices(plugin: ProjectManagerPlugin): Omit<TaskFormModalOptions, 'target' | 'form'> {
	const { index } = plugin.store;
	return {
		projects: index.projects(),
		epics: index.epics(),
		tasks: index.tasks(),
		allTasks: index.tasks({ includeArchived: true }),
		members: index.members(),
		statuses: plugin.config.statuses.task,
		displayName: plugin.personal.projectDisplayName,
		calendar: new WorkCalendar(plugin.config.calendar),
		today: localToday(),
	};
}
