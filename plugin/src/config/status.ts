import type { StatusCategory, StatusDef } from '../model';

/** ステータス名から定義を探す（旧名も対象） */
export function findStatus(defs: readonly StatusDef[], value: string): StatusDef | undefined {
	const name = value.trim();
	return defs.find((d) => d.name === name) ?? defs.find((d) => d.aliases.includes(name));
}

/** 完了系・停止系の分類か（もう作業しないタスク） */
export const isFinished = (category: StatusCategory | undefined): boolean => category === 'done' || category === 'stopped';

/** 名前が空でなく、他の名前・旧名と重ならないことを確かめる */
function checkName(defs: readonly StatusDef[], name: string, except?: StatusDef): void {
	if (name === '') throw new Error('ステータス名を入力してください');
	if (defs.some((d) => d !== except && (d.name === name || d.aliases.includes(name)))) {
		throw new Error(`「${name}」はすでに使われています（旧名を含む）`);
	}
}

/** ステータスの名前を変え、旧名を aliases に残す（設計書 5.4） */
export function renameStatus(defs: readonly StatusDef[], oldName: string, newName: string): StatusDef[] {
	const name = newName.trim();
	if (name === oldName) return [...defs];
	const target = defs.find((d) => d.name === oldName);
	if (!target) throw new Error(`ステータス「${oldName}」が見つかりません`);
	checkName(defs, name, target);
	return defs.map((d) => (d === target ? { ...d, name, aliases: [...d.aliases.filter((a) => a !== name), oldName] } : d));
}

export function addStatus(defs: readonly StatusDef[], newName: string, category: StatusCategory): StatusDef[] {
	const name = newName.trim();
	checkName(defs, name);
	return [...defs, { name, category, aliases: [] }];
}

/** ステータスを削除する。最後の1つは削除できない */
export function removeStatus(defs: readonly StatusDef[], name: string): StatusDef[] {
	if (defs.length <= 1) throw new Error('ステータスは1つ以上必要です');
	return defs.filter((d) => d.name !== name);
}

/** 並び順を1つ上（-1）か下（+1）に動かす */
export function moveStatus(defs: readonly StatusDef[], name: string, offset: -1 | 1): StatusDef[] {
	const list = [...defs];
	const from = list.findIndex((d) => d.name === name);
	const to = from + offset;
	if (from < 0 || to < 0 || to >= list.length) return list;
	const [item] = list.splice(from, 1);
	if (item) list.splice(to, 0, item);
	return list;
}

export function changeCategory(defs: readonly StatusDef[], name: string, category: StatusCategory): StatusDef[] {
	return defs.map((d) => (d.name === name ? { ...d, category } : d));
}
