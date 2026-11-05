import { type App, Setting } from 'obsidian';
import { parseToggled } from '../calc/wbs';

/** 開閉の状態の保存先（この PC だけ。設計書 9章） */
const STORAGE_KEY = 'project-manager:setting-groups';

/** 設定画面の開閉できるグループ。いちばん外側だけ初めから開く（設計書 9章） */
export class SettingGroups {
	/** 初期の開閉と逆にしたグループのキー */
	private readonly toggled: Set<string>;

	constructor(private readonly app: App) {
		this.toggled = parseToggled(app.loadLocalStorage(STORAGE_KEY));
	}

	/** グループを作り、中身を入れる要素を返す。キーは「.」で区切って入れ子を表す */
	add(parent: HTMLElement, key: string, name: string, desc?: string): HTMLElement {
		const openByDefault = !key.includes('.');
		const details = parent.createEl('details', { cls: 'pm-setting-group' });
		details.open = openByDefault !== this.toggled.has(key);

		const heading = new Setting(details.createEl('summary')).setName(name).setHeading();
		if (desc) heading.setDesc(desc);
		const mark = createSpan({ cls: 'pm-toggle', text: details.open ? '▼' : '▶' });
		heading.nameEl.prepend(mark);

		details.addEventListener('toggle', () => {
			mark.setText(details.open ? '▼' : '▶');
			const toggled = details.open !== openByDefault;
			if (toggled === this.toggled.has(key)) return;
			if (toggled) this.toggled.add(key);
			else this.toggled.delete(key);
			this.app.saveLocalStorage(STORAGE_KEY, [...this.toggled]);
		});
		return details.createDiv({ cls: 'pm-setting-group-body' });
	}
}
