import { type DropdownComponent, Setting, TextComponent } from 'obsidian';
import { compareJa, compareNumeric } from '../calc/compare';
import { findStatus } from '../config/status';
import { missingLabel } from '../forms/formValues';
import type { Epic, Member, NoteId, Project, StatusDef } from '../model';
import { projectLabel, type ProjectDisplayName } from '../settings';

/** 入力補助フォームで共通の部品（設計書 4.5） */

/** 入力の誤りの一覧。誤りが無ければ何も出さない */
export function errorBox(el: HTMLElement, errors: readonly string[]): void {
	if (errors.length === 0) return;
	const list = el.createDiv({ cls: 'pm-settings-warning' }).createEl('ul');
	for (const e of errors) list.createEl('li', { text: e });
}

/** 日付の入力欄 */
export function dateSetting(el: HTMLElement, name: string, desc: string, value: string, onChange: (v: string) => void): void {
	new Setting(el)
		.setName(name)
		.setDesc(desc)
		.addText((t) => {
			t.inputEl.type = 'date';
			t.setValue(value).onChange(onChange);
		});
}

/** 時間の入力欄にする（0.25刻み、0以上） */
export function hoursInput(t: TextComponent): TextComponent {
	t.inputEl.type = 'number';
	t.inputEl.step = '0.25';
	t.inputEl.min = '0';
	return t;
}

/** 表の編集画面のセルの入力欄 */
export function textCell(td: HTMLElement, value: string, onChange: (v: string) => void, type = 'text'): void {
	const t = new TextComponent(td).setValue(value).onChange(onChange);
	t.inputEl.type = type;
}

/** 表の編集画面の時間のセルの入力欄（0.25刻み） */
export function hoursCell(td: HTMLElement, value: string, onChange: (v: string) => void): void {
	hoursInput(new TextComponent(td)).setValue(value).onChange(onChange);
}

/** メンバー1人を選ぶ欄。選べるのは在籍者と「なし」。在籍していない人・読めない値が入っていれば残す（設計書 4.5） */
export function memberSetting(el: HTMLElement, name: string, desc: string, members: readonly Member[], value: NoteId, onChange: (v: NoteId) => void): void {
	new Setting(el)
		.setName(name)
		.setDesc(desc)
		.addDropdown((d) => memberOptions(d, members, value, onChange));
}

/** メンバー1人のプルダウンに選択肢を入れる（memberSetting と表の編集画面で共通） */
export function memberOptions(d: DropdownComponent, members: readonly Member[], value: NoteId, onChange: (v: NoteId) => void): void {
	d.addOption('', 'なし');
	const sorted = [...members].sort((a, b) => compareJa(a.title, b.title));
	for (const m of sorted) if (m.active || m.id === value) d.addOption(m.id, m.active ? m.title : `${m.title}（在籍していません）`);
	if (value && !sorted.some((m) => m.id === value)) d.addOption(value, missingLabel(value, 'user'));
	d.setValue(value).onChange(onChange);
}

/** ステータスの欄。設定に無い値も選んだまま残し、旧名は現在の名前で選ぶ（設計書 5.4） */
export function statusSetting(el: HTMLElement, statuses: readonly StatusDef[], value: string, onChange: (v: string) => void): void {
	new Setting(el).setName('ステータス').addDropdown((d) => {
		for (const s of statuses) d.addOption(s.name, s.name);
		const current = findStatus(statuses, value);
		if (value && !current) d.addOption(value, `${value}（設定にありません）`);
		d.setValue(current?.name ?? value).onChange(onChange);
	});
}

/** プロジェクトのプルダウンに選択肢を入れる（表示名の順）。選択肢に無い値も残す */
export function projectOptions(d: DropdownComponent, projects: readonly Project[], displayName: ProjectDisplayName, value: NoteId): void {
	d.addOption('', '選んでください');
	const label = (p: Project) => projectLabel(p, displayName);
	const sorted = [...projects].sort((a, b) => compareJa(label(a), label(b)));
	for (const p of sorted) d.addOption(p.id, label(p));
	if (value && !sorted.some((p) => p.id === value)) d.addOption(value, missingLabel(value, 'project'));
	d.setValue(value);
}

/** エピックのプルダウンに、そのプロジェクトのエピックを WBS 番号順に入れる。選択肢に無い値も残す（設計書 4.5） */
export function epicOptions(d: DropdownComponent, epics: readonly Epic[], project: NoteId, value: NoteId, empty = 'なし'): void {
	d.addOption('', empty);
	const sorted = epics.filter((e) => e.project === project).sort((a, b) => compareNumeric(a.wbs ?? '', b.wbs ?? '') || compareJa(a.title, b.title));
	for (const e of sorted) d.addOption(e.id, e.wbs ? `${e.wbs} ${e.title}` : e.title);
	if (value && !sorted.some((e) => e.id === value)) d.addOption(value, missingLabel(value, 'epic'));
	d.setValue(value);
}
