import { compareNumeric } from '../calc/compare';
import type { CalcContext } from '../calc/context';
import { epicLabel } from '../calc/taskList';
import { projectLabel, type ProjectDisplayName } from '../settings';
import type { Choice } from './filterBar';

const byLabel = (a: Choice, b: Choice) => compareNumeric(a.label, b.label);

/** 絞り込みのプロジェクトの選択肢（アーカイブ内を除く） */
export function projectChoices(ctx: CalcContext, mode: ProjectDisplayName): Choice[] {
	return ctx.index
		.projects()
		.map((p) => ({ value: p.id, label: projectLabel(p, mode) }))
		.sort(byLabel);
}

/** 絞り込みのエピックの選択肢。プロジェクトを指定していればその中だけ。WBS順 */
export function epicChoices(ctx: CalcContext, projects: readonly string[], mode: ProjectDisplayName): Choice[] {
	const prefix = projects.length !== 1;
	return ctx.index
		.epics()
		.filter((e) => projects.length === 0 || projects.includes(e.project))
		.map((e) => {
			const project = ctx.projects.get(e.project);
			const label = epicLabel(e);
			return { value: e.id, label: prefix && project ? `${projectLabel(project, mode)} / ${label}` : label };
		})
		.sort(byLabel);
}

/** 絞り込みのメンバーの選択肢（在籍者のみ） */
export function memberChoices(ctx: CalcContext): Choice[] {
	return ctx.index
		.members()
		.filter((m) => m.active)
		.map((m) => ({ value: m.id, label: m.title }))
		.sort(byLabel);
}

/** 絞り込みのステータスの選択肢（タスク・エピック用。設定の並び順） */
export function statusChoices(ctx: CalcContext): Choice[] {
	return ctx.statuses.task.map((s) => ({ value: s.name, label: s.name }));
}
