import { findCycles } from '../calc/schedule';
import { findStatus } from '../config/status';
import { isSynced } from '../write/aliases';
import type { NoteId, NoteType, StatusSets } from '../model';
import { problem, type NoteProblem, type ProblemFix } from '../store/buildNote';
import { TYPE_LABEL } from '../store/coerce';
import type { VaultIndex } from '../store/vaultIndex';

/** Vault 全体の健全性チェック（設計書 8章） */
export function checkHealth(index: VaultIndex, statuses: StatusSets): NoteProblem[] {
	const problems = index.problems();

	for (const record of index.records()) {
		const { note, path } = record;
		if (!note) continue;
		const report = (message: string, fix?: ProblemFix, line?: number) => problems.push(problem(path, message, fix, line));

		/** 参照先があるか。読めないノートも「ある」とみなす */
		const ref = (key: string, id: NoteId | undefined, type: NoteType, fix?: ProblemFix, line?: number) => {
			if (id && !index.hasId(id)) report(`${key} の${TYPE_LABEL[type]}（${id}）が見つかりません`, fix, line);
		};
		const status = (set: keyof StatusSets, value: string) => {
			if (!findStatus(statuses[set], value)) {
				report(`ステータス「${value}」が設定にありません（設定画面のステータス一覧と旧名を確認してください）`, 'form');
			}
		};

		// aliases はタイトル1つだけ（設計書 4.2）。フォームで保存すると揃う
		if ('title' in note && note.title !== '' && !isSynced(note.title, note.aliases)) {
			report(
				note.aliases.includes(note.title)
					? 'aliases（別名）にタイトル以外の値があります。タイトル1つだけにしてください'
					: 'aliases（別名）がタイトルと違います。クイックスイッチャーやリンクの候補にタイトルで出なくなります',
				'form',
			);
		}

		switch (note.type) {
			case 'project':
				status('project', note.status);
				ref('manager', note.manager, 'user', 'form');
				for (const m of note.milestones) {
					ref('マイルストーンの連動エピック', m.epic, 'epic', 'milestones', m.line);
					const epic = m.epic ? index.get(m.epic) : undefined;
					if (epic?.type === 'epic' && epic.project !== note.id) {
						report(`マイルストーン「${m.name}」の連動エピックが、別のプロジェクトのエピックです`, 'milestones', m.line);
					}
				}
				for (const a of note.allocations) ref('工数配分のメンバー', a.member, 'user', 'allocations', a.line);
				break;

			case 'epic':
				status('task', note.status);
				ref('project', note.project, 'project', 'form');
				ref('owner', note.owner, 'user', 'form');
				break;

			case 'task': {
				status('task', note.status);
				ref('project', note.project, 'project', 'form');
				ref('epic', note.epic, 'epic', 'form');
				const epic = note.epic ? index.get(note.epic) : undefined;
				if (epic?.type === 'epic' && epic.project !== note.project) {
					report('epic が、タスクの project とは別のプロジェクトのエピックです', 'form');
				}
				for (const a of note.assignees) ref('assignees', a, 'user', 'form');
				for (const d of note.dependsOn) {
					if (d === note.id) report('depends_on に自分自身が入っています', 'form');
					else ref('depends_on', d, 'task', 'form');
				}
				break;
			}

			// 作業ログのプロパティには直す画面が無い
			case 'worklog':
				ref('member', note.member, 'user');
				for (const e of note.entries) ref('作業ログのタスク', e.task, 'task', 'worklog', e.line);
				break;

			case 'user':
				break;
		}
	}
	// depends_on の循環（自分自身への依存は上で報告済み）
	const tasks = index.tasks({ includeArchived: true });
	const byId = new Map(tasks.map((t) => [t.id, t]));
	for (const cycle of findCycles(tasks)) {
		if (cycle.length < 2) continue;
		const names = cycle.map((id) => byId.get(id)?.title || id);
		const route = [...names, names[0]].join(' → ');
		for (const id of cycle) {
			const task = byId.get(id);
			if (task) {
				problems.push(problem(task.path, `depends_on が循環しています（${route}）`, 'form'));
			}
		}
	}
	return problems;
}
