# 図

今の作りを、クラス図とシーケンス図で示す。

- 図は Mermaid で書く。Obsidian・VS Code のプレビューで図として表示される
- 理由や細かい決まりは [DESIGN.md](DESIGN.md) に書き、ここでは節番号で参照する
- 図に出すのは主なクラス・関数だけ。すべての項目は載せない
- クラスや処理の流れを変えたら、この文書も直す。**節番号は変えない**

---

## 1. クラス図

### 1.1 全体（プラグインと主なクラス）

- `ProjectManagerPlugin` が共有設定（`SharedConfig`）と索引の管理（`VaultStore`）を1つずつ持つ
- ビューは描くたびに `ContextCache` から計算用のデータ（`CalcContext`）を受け取る（設計書 11章）
- 「Obsidian」の印は Obsidian API のクラス

```mermaid
classDiagram
	class Plugin {
		<<Obsidian>>
	}
	class Events {
		<<Obsidian>>
	}
	class ProjectManagerPlugin {
		+settings: PluginSettings
		+personal: PersonalSettings
		+config: SharedConfig
		+store: VaultStore
		+usage: UsageCounter
		+onload()
		+saveSettings()
		+savePersonal()
	}
	class SharedConfig {
		+statuses: StatusSets
		+calendar: Calendar
		+problems: ConfigProblem[]
		+load()
		+onChange(listener)
		+saveStatuses(statuses)
		+saveCalendar(calendar)
	}
	class VaultStore {
		+index: VaultIndex
		+ready: boolean
		+rebuild()
		+watch() EventRef[]
		+onUpdated(callback)
		+onTitleChanged(callback)
		+writeMany(paths, write)
	}
	class VaultIndex {
		+version: number
		+set(record)
		+delete(path)
		+get(id) AnyNote
		+records() NoteRecord[]
		+projects() readonly Project[]
		+epics() readonly Epic[]
		+tasks() readonly Task[]
		+members() readonly Member[]
		+worklogs() readonly Worklog[]
		-groupedLists() 種類ごとの一覧
		+problems() NoteProblem[]
	}
	class UsageCounter {
		<<interface>>
		+countStatus(set, names)
		+countWorklogEntriesOn(date)
	}
	class NoteRecord {
		+path: string
		+id: NoteId
		+type: NoteType
		+note?: AnyNote
		+title?: string
		+archived: boolean
		+problems: NoteProblem[]
	}
	class buildNote {
		<<function>>
	}
	class PmView {
		<<abstract>>
	}
	class ContextCache {
		+get(index, statuses, calendar, today) CalcContext
	}
	class CalcContext {
		+index: VaultIndex
		+statuses: StatusSets
		+calendar: WorkCalendar
		+summary: WorkSummary
		+allocations: AllocationSummary
		+projects: Map
		+epics: Map
		+members: Map
		+byProject: Map
		+warningsOf(task) Warning[]
		+schedule: ScheduleResult
		+today: IsoDate
	}

	Plugin <|-- ProjectManagerPlugin
	Events <|-- VaultStore
	UsageCounter <|.. VaultIndex
	ProjectManagerPlugin *-- SharedConfig
	ProjectManagerPlugin *-- VaultStore
	VaultStore *-- VaultIndex
	VaultIndex o-- "*" NoteRecord
	VaultStore ..> buildNote : ファイルから作る
	buildNote ..> NoteRecord : 返す
	PmView --> ProjectManagerPlugin : plugin
	PmView ..> ContextCache : 描くたびに get
	ContextCache ..> CalcContext : 作る・使い回す
	CalcContext --> VaultIndex
	CalcContext *-- WorkCalendar
	CalcContext *-- WorkSummary
	CalcContext *-- AllocationSummary
```

### 1.2 ノートの型（`model/`）

- 実線のひし形は、ノートの本文の表の行を持つことを表す（7章）
- 点線の矢印は、ID（`[[接頭辞-UUID]]`）での参照を表す。矢印の文字はプロパティ名
- 各ノートの `type` は `project`・`epic`・`task`・`user`・`worklog`

```mermaid
classDiagram
	class NoteBase {
		+id: NoteId
		+path: string
	}
	class TitledNote {
		+title: string
		+aliases: string[]
	}
	class TableRow {
		+line: number
	}
	class Project {
		+caseId: string
		+officialName: string
		+status: string
		+start?: IsoDate
		+due?: IsoDate
		+manager?: NoteId
	}
	class Epic {
		+project: NoteId
		+status: string
		+owner?: NoteId
		+wbs?: string
		+start?: IsoDate
		+due?: IsoDate
		+inputs: string[]
		+outputs: string[]
	}
	class Task {
		+project: NoteId
		+epic?: NoteId
		+wbs?: string
		+status: string
		+assignees: NoteId[]
		+estimate?: number
		+dependsOn: NoteId[]
		+start?: IsoDate
		+due?: IsoDate
		+planStart?: IsoDate
		+planEnd?: IsoDate
		+subtasks: SubtaskCount
	}
	class Member {
		+familyName?: string
		+givenName?: string
		+dailyHours: number
		+loadLimitPct: number
		+active: boolean
	}
	class Worklog {
		+member: NoteId
		+month: YearMonth
	}
	class Milestone {
		+name: string
		+date: IsoDate
		+epic?: NoteId
	}
	class Allocation {
		+month: YearMonth
		+member: NoteId
		+hours: number
	}
	class PersonalHoliday {
		+date: IsoDate
		+memo: string
	}
	class WorklogEntry {
		+date: IsoDate
		+task: NoteId
		+planned: number
		+actual: number
		+memo: string
	}
	class SubtaskCount {
		+done: number
		+total: number
	}

	NoteBase <|-- TitledNote
	NoteBase <|-- Worklog
	TitledNote <|-- Project
	TitledNote <|-- Epic
	TitledNote <|-- Task
	TitledNote <|-- Member
	TableRow <|-- Milestone
	TableRow <|-- Allocation
	TableRow <|-- PersonalHoliday
	TableRow <|-- WorklogEntry

	Project *-- "*" Milestone : milestones
	Project *-- "*" Allocation : allocations
	Member *-- "*" PersonalHoliday : holidays
	Worklog *-- "*" WorklogEntry : entries
	Task *-- SubtaskCount : subtasks

	Project ..> Member : manager
	Epic ..> Project : project
	Epic ..> Member : owner
	Task ..> Project : project
	Task ..> Epic : epic
	Task ..> Member : assignees
	Task ..> Task : dependsOn
	Worklog ..> Member : member
	WorklogEntry ..> Task : task
	Milestone ..> Epic : epic
	Allocation ..> Member : member
```

### 1.3 共有設定の型（`model/`、設計書 5章）

```mermaid
classDiagram
	class StatusSets {
		+task: StatusDef[]
		+project: StatusDef[]
	}
	class StatusDef {
		+name: string
		+category: StatusCategory
		+aliases: string[]
	}
	class StatusCategory {
		<<enumeration>>
		not_started
		in_progress
		done
		stopped
	}
	class Calendar {
		+weekendsOff: boolean
		+holidays: Holiday[]
	}
	class Holiday {
		+date: IsoDate
		+name: string
	}

	StatusSets *-- "*" StatusDef
	StatusDef --> StatusCategory
	Calendar *-- "*" Holiday
```

### 1.4 画面のクラス（`views/`・`ui/`）

- ビューはすべて `PmView` を継ぐ（設計書 9.1）
  - 中身は `draw(el, ctx)` だけを書く。描き直しのきっかけと枠（シェル）は `PmView` が受け持つ
- 保存して閉じる入力画面は `FormModal` を継ぐ（設計書 4.5, 4.6）
  - 中身は `render()` を書き、保存は `submit(check, write)` に任せる
- タスク一覧・作業ログ・ガント・カンバン・WBS の中身は部品（`Panel`）。ビューは部品を1つ載せる（設計書 9.12）
  - メンバーダッシュボードは、同じ部品を種類ごとに1つずつ作って並べる（設計書 9.11）
  - 部品は保存・描き直しを置き場所（`PanelHost`）に頼む
- WBS・ガントの部品とプロジェクト状況は `WbsDrag` を1つずつ持ち、行のドラッグで番号を書き換える（設計書 9.7）
- 同じ3つは `TreeToggle`（開閉の状態）と `ChildRows`（タスクの行の足し引き）も1つずつ持つ（設計書 9.7）

```mermaid
classDiagram
	class ItemView {
		<<Obsidian>>
	}
	class Modal {
		<<Obsidian>>
	}
	class FuzzySuggestModal {
		<<Obsidian>>
	}
	class PluginSettingTab {
		<<Obsidian>>
	}
	class PmView {
		<<abstract>>
		#filter: ViewFilter
		#gridLines: boolean
		#draw(el, ctx)*
		+redraw()
		+setState(state, result)
		#readState(state)
		#saveState()
		#shell(el, options) Shell
		#setFilter(filter)
		#panelHost() PanelHost
	}
	class Panel {
		<<abstract>>
		#host: PanelHost
		+title: string
		+draw(shell, ctx, scope?)*
		+getState()*
		+setState(state)*
	}
	class PanelHost {
		<<interface>>
		+changed()
		+save()
		+redraw()
		+gridLines() boolean
	}
	class FormModal {
		<<abstract>>
		#errors: string[]
		#render()*
		#footer(onSave)
		#submit(check, write)
		#submitNote(note, check, items)
	}

	ItemView <|-- PmView
	PmView <|-- TaskListView
	PmView <|-- MemberStatusView
	PmView <|-- ProjectStatusView
	PmView <|-- DashboardView
	PmView <|-- KanbanView
	PmView <|-- WbsView
	PmView <|-- GanttView
	PmView <|-- ArchiveView
	PmView <|-- WorklogView
	PmView <|-- HealthView
	PmView <|-- MemberDashboardView

	Panel ..> PanelHost : 保存・描き直しを頼む
	Panel <|-- TaskListPanel
	Panel <|-- WorklogPanel
	Panel <|-- GanttPanel
	Panel <|-- KanbanPanel
	Panel <|-- WbsPanel
	Panel <|-- LoadPanel
	Panel <|-- AssignedProjectsPanel
	Panel <|-- MemberTaskListPanel
	Panel <|-- MonthTasksPanel
	TaskListView *-- TaskListPanel
	WorklogView *-- WorklogPanel
	GanttView *-- GanttPanel
	KanbanView *-- KanbanPanel
	WbsView *-- WbsPanel
	MemberDashboardView *-- Panel : 種類ごとに1つ（createMemberPanel）
	MemberTaskListPanel *-- TaskListPanel : その月の担当タスクに固定
	MonthTasksPanel *-- Panel : ガント・カンバン・WBS を包む
	MemberDashboardView ..> MemberPanelsModal : 部品を選ぶ
	WorklogPanel ..> WorklogGridModal : 押すと入力フォームを開く
	WbsPanel *-- WbsDrag : 行のドラッグで番号を入れ替え
	GanttPanel *-- WbsDrag
	ProjectStatusView *-- WbsDrag
	WbsDrag ..> VaultStore : writeMany でまとめて書く
	WbsPanel *-- TreeToggle : 開閉の状態
	GanttPanel *-- TreeToggle
	ProjectStatusView *-- TreeToggle
	WbsPanel *-- ChildRows : タスクの行を足し引き
	GanttPanel *-- ChildRows
	ProjectStatusView *-- ChildRows

	Modal <|-- FormModal
	FormModal <|-- TaskFormModal
	FormModal <|-- EpicFormModal
	FormModal <|-- ProjectFormModal
	FormModal <|-- MemberFormModal
	FormModal <|-- TableEditModal
	FormModal <|-- ChecklistModal
	FormModal <|-- AllocationMatrixModal
	Modal <|-- WorklogGridModal
	WorklogGridModal *-- WorklogGridDraft : 保存前・保存済みの値
	Modal <|-- NewNoteModal
	Modal <|-- CopyProjectModal
	Modal <|-- LoadDetailModal
	Modal <|-- MemberPanelsModal
	FuzzySuggestModal <|-- ChooseModal
	PluginSettingTab <|-- ProjectManagerSettingTab
```

---

## 2. シーケンス図

### 2.1 起動から索引の作成まで（設計書 1.3, 3.2）

- `onload` では登録だけをし、重い読み込みは `onLayoutReady` の後に行う
- 索引ができるまで、開いているビューは「読み込み中…」を出す

```mermaid
sequenceDiagram
	participant O as Obsidian
	participant P as ProjectManagerPlugin
	participant C as SharedConfig
	participant S as VaultStore
	participant B as buildNote
	participant I as VaultIndex
	participant V as ビュー（PmView）

	O->>P: onload()
	P->>P: 設定を読む（loadData・mergeSettings・mergePersonal）
	P->>C: new SharedConfig(app, 設定フォルダ)
	P->>S: new VaultStore(app, getSettings)
	P->>P: register…（コマンド・ビュー・メニュー・設定画面）
	O-->>P: onLayoutReady
	P->>C: load()
	C->>O: statuses.json・calendar.json を読む
	C-->>V: onChange（開いていれば描き直す）
	P->>P: registerConfigWatcher（設定ファイルの変更を監視）
	P->>S: watch() の戻り値を registerEvent
	P->>S: rebuild()
	loop 200件ずつ
		S->>O: getFileCache・cachedRead（本文はプロジェクト・メンバー・作業ログだけ）
		S->>B: buildNote(source)
		B-->>S: NoteRecord
		S->>S: sleep(0) で処理を譲る
	end
	S->>I: clear() して set(record) で入れ替える
	S->>S: rereadChanged()（作り直し中に変わったファイルを読み直す）
	S->>S: ready = true
	S-->>V: updated
	V->>V: redraw() → ContextCache.get() → draw(el, ctx)
	P->>P: usage = store.index
```

### 2.2 ノートの変更と差分更新（設計書 3.3, 4.2, 9.1）

- 利用者の操作でも、プラグインの書き込みでも、同じ流れで画面に届く
- 名前の変更は vault の `rename`、削除は vault の `delete` で受ける（この図では省く）

```mermaid
sequenceDiagram
	participant O as Obsidian（MetadataCache）
	participant S as VaultStore
	participant B as buildNote
	participant I as VaultIndex
	participant A as aliasSync
	participant V as ビュー（PmView）

	O->>S: changed(file, data, cache)
	S->>S: ノートIDの形か確かめる・作り直し中なら覚えておく
	S->>S: 変更前のタイトルを控える
	S->>B: buildNote(source)
	B-->>S: NoteRecord
	S->>I: set(record)（version が増える）
	opt タイトルが変わった（最初の読み込みの後）
		S-->>A: title-changed
		A->>A: 1.5秒待つ（続けて変われば待ち直す）
		A->>O: writeFrontmatter で aliases を書く
		Note over A,O: この書き込みがまた changed を起こす
	end
	S->>S: notify()（300ミリ秒まとめる）
	S-->>V: updated
	alt ビューが見えている
		V->>V: redraw()
		V->>V: ContextCache.get()（version が変わったので作り直す）
		V->>V: draw(el, ctx)
	else 見えていない
		V->>V: pending にして、見えたときに描く
	end
```

### 2.3 入力補助フォームでの書き込み（設計書 4.1, 4.5, 4.6, 4.11, 4.15）

- タスクの例。エピック・プロジェクト・メンバーも同じ流れ（本文の説明はタスクだけ）
- 画面の更新は書き込みの後、2.2 の流れで起こる

```mermaid
sequenceDiagram
	actor U as 利用者
	participant E as editTask.ts
	participant F as taskForm.ts（純粋）
	participant D as taskDescription.ts（純粋）
	participant M as TaskFormModal
	participant C as noteChanges.ts（純粋）
	participant Q as NoteChangedModal
	participant W as noteFile.ts
	participant O as Obsidian（vault・fileManager）
	participant A as applyFrontmatter（純粋）

	U->>E: ビューの行のクリック（コマンド・右クリックも）
	E->>W: formSource() → readNoteItems()（ファイルから frontmatter と説明を読む）
	W->>D: descriptionOf(本文)
	W-->>E: 開いたときの写し
	E->>F: taskFormFromFrontmatter(写し)
	F-->>E: TaskForm
	E->>M: new TaskFormModal(候補は store.index から、写し).open()
	U->>M: 日付・日数を変える
	M->>M: previewTaskSchedule()（見込みの日程を出し直す。書かない）
	U->>M: 入力して「保存」
	M->>M: submitNote()（保存中なら受け付けない）
	M->>F: taskFormToUpdate(form, statuses, taskId)
	F-->>M: errors・warnings・update
	M->>D: descriptionErrors(説明)
	alt errors がある
		M->>M: errors を表示して render()
	else errors が無い
		M->>W: readNoteItems()（今のノート）
		M->>C: noteChanges(開いたとき, 今のノート, フォームの値)
		opt 開いたあとにノートが変わっていた
			M->>Q: askNoteChanged(差分)
			Q-->>M: 変えた項目だけ上書き／すべて保存／開き直す／フォームに戻る
		end
		M->>C: editedItems()（書く項目だけ）
		M->>W: writeNoteItems(確かめた写し, 書く項目)
		W->>O: vault.process(file, applyDescription)（説明を変えたときだけ）
		W->>O: processFrontMatter(file, callback)（書く項目があるときだけ）
		O->>A: 確かめた写しと同じか見てから applyFrontmatter(fm, type, update)
		A-->>O: キーを決めた順に入れ直す
		alt 書き込みに失敗
			M-->>U: お知らせ「保存できませんでした」（画面は開いたまま）
		else 成功
			M-->>U: warnings があればお知らせ。画面を閉じる
		end
	end
```
