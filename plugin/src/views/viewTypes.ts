/**
 * ビューの種類の ID（設計書 9章）。ビューどうし・メニューから開くときはここから読む。
 * ビューのファイルを互いに読み込み合わないように、1か所に置く。リリース後は変えない（保存された画面の配置が使う）
 */

export const TASK_LIST_VIEW_TYPE = 'pm-task-list';
export const MEMBER_STATUS_VIEW_TYPE = 'pm-member-status';
export const PROJECT_STATUS_VIEW_TYPE = 'pm-project-status';
export const DASHBOARD_VIEW_TYPE = 'pm-dashboard';
export const KANBAN_VIEW_TYPE = 'pm-kanban';
export const WBS_VIEW_TYPE = 'pm-wbs';
export const GANTT_VIEW_TYPE = 'pm-gantt';
export const ARCHIVE_VIEW_TYPE = 'pm-archive';
export const HEALTH_VIEW_TYPE = 'pm-health';
export const WORKLOG_VIEW_TYPE = 'pm-worklog';
export const MEMBER_DASHBOARD_VIEW_TYPE = 'pm-member-dashboard';
