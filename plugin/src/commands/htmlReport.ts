import { promises as fs } from 'fs';
import { join } from 'path';
import { Notice } from 'obsidian';
import { buildContext } from '../calc/context';
import { localToday } from '../calc/dates';
import { EMPTY_FILTER, filterProjects } from '../calc/filter';
import type ProjectManagerPlugin from '../main';
import { buildHtmlReport, REPORT_FILE_NAME } from '../report/htmlReport';
import { reportFolderProblem } from '../settings';
import { notifyError } from '../ui/notify';

/** HTMLレポートを書き出すコマンドを登録する（要件4.10） */
export function registerHtmlReport(plugin: ProjectManagerPlugin): void {
	plugin.addCommand({
		id: 'export-html-report',
		name: 'HTMLレポートを書き出す',
		callback: () => void exportHtmlReport(plugin),
	});
}

/** 個人の設定の出力先フォルダに、HTMLレポートを上書きで書き出す（設計書 13章） */
export async function exportHtmlReport(plugin: ProjectManagerPlugin): Promise<void> {
	const folder = plugin.personal.reportFolder;
	const problem = reportFolderProblem(folder);
	if (problem) {
		new Notice(problem);
		return;
	}
	const { store, config } = plugin;
	if (!store.ready) {
		new Notice('データの読み込み中です。少し待ってからもう一度実行してください');
		return;
	}
	// 共有フォルダのつなぎ忘れに気づけるよう、フォルダは作らない
	try {
		if (!(await fs.stat(folder)).isDirectory()) throw new Error('not a directory');
	} catch {
		new Notice(`出力先フォルダが見つかりません：${folder}\n共有フォルダにつながっているか、設定のパスが正しいか確かめてください`);
		return;
	}

	const ctx = buildContext(store.index, config.statuses, config.calendar, localToday());
	const html = buildHtmlReport(ctx, {
		projects: filterProjects(ctx.index.projects(), EMPTY_FILTER, ctx.statuses),
		members: ctx.index.members().filter((m) => m.active),
		displayName: plugin.personal.projectDisplayName,
		generatedAt: localDateTime(),
		colors: plugin.settings.colors,
		statusColors: plugin.settings.statusColors,
	});
	const file = join(folder, REPORT_FILE_NAME);
	try {
		await fs.writeFile(file, html, 'utf8');
		new Notice(`HTMLレポートを書き出しました：${file}`);
	} catch (e) {
		notifyError(e, `HTMLレポートを書き出せませんでした：${file}`);
	}
}

/** この PC の今の日時（`YYYY-MM-DD HH:MM`） */
function localDateTime(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${localToday()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
