import { Plugin } from 'obsidian';
import { registerAliasSync } from './commands/aliasSync';
import { registerConfigWatcher } from './commands/configWatcher';
import { registerCopyProject } from './commands/copyProject';
import { registerCreateCommands } from './commands/createNote';
import { registerEditChecklist } from './commands/editChecklist';
import { registerEditHolidays } from './commands/editHolidays';
import { registerEditTask } from './commands/editTask';
import { registerHtmlReport } from './commands/htmlReport';
import { registerReadme } from './commands/readme';
import { registerReload } from './commands/reload';
import { registerWorklog } from './commands/worklog';
import { NO_USAGE, type UsageCounter } from './config/impact';
import { SharedConfig } from './config/sharedConfig';
import { mergePersonal, mergeSettings, type PersonalSettings, type PluginSettings } from './settings';
import { VaultStore } from './store/vaultStore';
import { registerKindColors } from './ui/kindColors';
import { registerMainMenu } from './ui/mainMenu';
import { ProjectManagerSettingTab } from './ui/settingsTab';
import { registerArchiveView } from './views/archiveView';
import { registerDashboardView } from './views/dashboardView';
import { registerGanttView } from './views/ganttView';
import { registerHealthView } from './views/healthView';
import { registerKanbanView } from './views/kanbanView';
import { registerMemberDashboardView } from './views/memberDashboardView';
import { registerMemberStatusView } from './views/memberStatusView';
import { registerProjectStatusView } from './views/projectStatusView';
import { registerTaskListView } from './views/taskListView';
import { registerWbsView } from './views/wbsView';
import { registerWorklogView } from './views/worklogView';

/** 個人の設定の保存先（設計書 6章） */
const PERSONAL_KEY = 'project-manager:personal';

export default class ProjectManagerPlugin extends Plugin {
	settings!: PluginSettings;
	personal!: PersonalSettings;
	config!: SharedConfig;
	store!: VaultStore;
	/** 設定変更の影響の件数（設計書 5.5） */
	usage: UsageCounter = NO_USAGE;

	async onload() {
		const data: unknown = await this.loadData();
		this.settings = mergeSettings(data);
		this.personal = mergePersonal(this.app.loadLocalStorage(PERSONAL_KEY), data);
		this.config = new SharedConfig(this.app, this.settings.folders.config);
		this.store = new VaultStore(this.app, () => this.settings);

		this.addSettingTab(new ProjectManagerSettingTab(this.app, this));
		registerKindColors(this);
		registerReload(this);
		registerCreateCommands(this);
		registerCopyProject(this);
		registerAliasSync(this);
		registerEditTask(this);
		registerEditHolidays(this);
		registerEditChecklist(this);
		registerWorklog(this);
		registerHealthView(this);
		registerTaskListView(this);
		registerMemberStatusView(this);
		registerMemberDashboardView(this);
		registerProjectStatusView(this);
		registerDashboardView(this);
		registerKanbanView(this);
		registerWbsView(this);
		registerGanttView(this);
		registerWorklogView(this);
		registerHtmlReport(this);
		registerArchiveView(this);
		registerReadme(this);
		registerMainMenu(this);

		// 重い処理は起動完了後（設計書 3.2）
		this.app.workspace.onLayoutReady(async () => {
			await this.config.load();
			registerConfigWatcher(this);
			for (const ref of this.store.watch()) this.registerEvent(ref);
			await this.store.rebuild();
			this.usage = this.store.index;
		});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	savePersonal(): void {
		this.app.saveLocalStorage(PERSONAL_KEY, this.personal);
	}
}
