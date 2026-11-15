import { compareJa } from '../calc/compare';
import type { NoteId, Task, Worklog } from '../model';

/** タスクを消せない理由。空なら消せる（作業ログの記録・先行タスクとしての参照があれば消せない） */
export function taskDeleteBlockers(taskId: NoteId, tasks: readonly Task[], worklogs: readonly Worklog[], title: (id: NoteId) => string): string[] {
	const blockers: string[] = [];

	const logs = worklogs
		.map((log) => ({ log, rows: log.entries.filter((e) => e.task === taskId).length }))
		.filter((x) => x.rows > 0)
		.sort((a, b) => a.log.month.localeCompare(b.log.month) || compareJa(title(a.log.member), title(b.log.member)));
	if (logs.length > 0) {
		const where = logs.map(({ log, rows }) => `${title(log.member) || log.member} ${log.month}（${rows}行）`).join('、');
		blockers.push(`作業ログに記録があります：${where}`);
	}

	const dependents = tasks
		.filter((t) => t.id !== taskId && t.dependsOn.includes(taskId))
		.map((t) => t.title || t.id)
		.sort(compareJa);
	if (dependents.length > 0) blockers.push(`先行タスクにしているタスクがあります：${dependents.join('、')}`);

	return blockers;
}
