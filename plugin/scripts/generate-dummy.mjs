// 動作確認用のダミーデータを開発用Vaultに作る（要件6.3）。
//
//   node scripts/generate-dummy.mjs            作る（すでにあれば消してから作り直す）
//   node scripts/generate-dummy.mjs --clean    消すだけ
//   オプション：--vault <パス>（既定は OBSIDIAN_VAULT か ../../dev-projectmanager-plugin-vault）、--seed <数>、
//             --today <YYYY-MM-DD>（基準日。既定は実行した日）
//
// 日程・ステータス・見積・配分は基準日に合わせて作り、警告はわざと入れたものだけが出るようにする
// （クローズ以外のプロジェクトに、期限超過・工数超過・期限超過見込みを1件ずつ。一部に配分超過。設計書 12章）。
//
// 作るノートには frontmatter に `dummy: true` を入れ、消すときはそれが入ったファイルだけを消す
// （手で作ったノートは消さない）。乱数は seed で固定するので、何度作っても同じ内容になる。
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(name);
	return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const vault = path.resolve(root, option('--vault', process.env.OBSIDIAN_VAULT ?? '../../dev-projectmanager-plugin-vault'));
const clean = args.includes('--clean');
let seed = Number(option('--seed', '20261101'));

// ---- 規模（要件6.3：50人・約10プロジェクト・数千タスク） ----
const MEMBER_COUNT = 50;
const PROJECT_COUNT = 10;
const EPICS_PER_PROJECT = [5, 8];
const TASKS_PER_EPIC = [40, 70];
/** 基準日（今日）。この日に開くと警告がプロジェクトごとに数件になるように作る。この日より前は実績も入れる */
const TODAY = option('--today', localToday());
/** 作業ログを作る月（基準日の2か月前〜2か月後） */
const LOG_MONTHS = [-2, -1, 0, 1, 2].map((n) => addMonths(TODAY.slice(0, 7), n));
/** 配分超過もわざと入れるプロジェクト（並びの番号。ほかの警告は、クローズ以外の全プロジェクトに1件ずつ入れる） */
const OVER_ALLOCATION_PROJECTS = new Set([1, 4]);

function localToday() {
	const d = new Date();
	const pad = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addMonths(month, n) {
	const [y, m] = month.split('-').map(Number);
	const i = y * 12 + (m - 1) + n;
	return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

// ---- 乱数（seed 固定） ----
function random() {
	seed = (seed * 1664525 + 1013904223) % 4294967296;
	return seed / 4294967296;
}
const int = (min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (list) => list[Math.floor(random() * list.length)];
const chance = (p) => random() < p;
const quarter = (min, max) => Math.round((min + random() * (max - min)) * 4) / 4;
function sample(list, n) {
	const copy = [...list];
	const result = [];
	while (result.length < n && copy.length > 0) result.push(copy.splice(Math.floor(random() * copy.length), 1)[0]);
	return result;
}

// ---- UUID v7（src/id/uuid7.ts と同じ形式） ----
let clock = Date.UTC(2026, 9, 1);
function uuid7() {
	const bytes = new Uint8Array(16);
	let ms = clock++;
	for (let i = 5; i >= 0; i--) {
		bytes[i] = ms % 256;
		ms = Math.floor(ms / 256);
	}
	for (let i = 6; i < 16; i++) bytes[i] = Math.floor(random() * 256);
	bytes[6] = (bytes[6] & 0x0f) | 0x70;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---- 日付 ----
const toDate = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => fmt(new Date(toDate(s).getTime() + n * 86400000));

// ---- frontmatter の書き出し（プラグインが書く形にそろえる） ----
function yamlValue(v) {
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	// リンク・数字に見える文字列・記号を含む文字列は引用符で囲む
	if (/^\[\[|^[\d.]+$|^(true|false|null|yes|no)$|[:#[\]{},&*!|>'"%@`]|^[-?\s]|\s$/.test(v)) return JSON.stringify(v);
	return v;
}
function frontmatter(fields) {
	const lines = ['---'];
	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined) continue;
		if (Array.isArray(value)) {
			if (value.length === 0) continue;
			lines.push(`${key}:`);
			for (const item of value) lines.push(`  - ${yamlValue(item)}`);
		} else {
			lines.push(`${key}: ${yamlValue(value)}`);
		}
	}
	lines.push('dummy: true', '---');
	return lines.join('\n');
}
const link = (id) => `[[${id}]]`;
const cellLink = (id, title) => `[[${id}\\|${title}]]`;

// ---- Vault ----
if (!existsSync(path.join(vault, '.obsidian'))) {
	console.error(`Vault が見つかりません: ${vault}`);
	process.exit(1);
}
const settingsPath = path.join(vault, '.obsidian', 'plugins', 'project-manager', 'data.json');
const folders = {
	projects: 'Projects',
	epics: 'Epics',
	tasks: 'Tasks',
	members: 'Members',
	logs: 'Members/Logs',
	config: '_pm',
	...(existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')).folders : {}),
};

/** dummy: true のファイルを消す */
function removeDummy() {
	let count = 0;
	const walk = (dir) => {
		if (!existsSync(dir)) return;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!entry.name.startsWith('.')) walk(p);
			} else if (entry.name.endsWith('.md') && /^---\n[\s\S]*?\ndummy: true\n---/.test(readFileSync(p, 'utf8'))) {
				rmSync(p);
				count++;
			}
		}
	};
	walk(vault);
	return count;
}

const removed = removeDummy();
console.log(`ダミーデータを ${removed} 件消しました`);
if (clean) process.exit(0);

const files = new Map();
const write = (folder, id, content) => files.set(path.join(vault, folder, `${id}.md`), `${content}\n`);

// 休日（_pm/calendar.json があれば使う）
const calendarPath = path.join(vault, folders.config, 'calendar.json');
const calendar = existsSync(calendarPath) ? JSON.parse(readFileSync(calendarPath, 'utf8')) : { weekendsOff: true, holidays: [] };
const holidays = new Set((calendar.holidays ?? []).map((h) => h.date));
const isWorkday = (s) => {
	const day = toDate(s).getUTCDay();
	return !(calendar.weekendsOff && (day === 0 || day === 6)) && !holidays.has(s);
};
/** その日か次の稼働日 */
const nextWorkday = (s) => {
	while (!isWorkday(s)) s = addDays(s, 1);
	return s;
};
/** n 稼働日あと（プラグインの WorkCalendar.addWorkdays と同じ数え方） */
const addWorkdays = (s, n) => {
	for (let left = n; left > 0; ) {
		s = addDays(s, 1);
		if (isWorkday(s)) left--;
	}
	return s;
};

// ---- メンバー ----
const FAMILY = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '清水', '山崎'];
const GIVEN = ['翔', '陽菜', '蓮', '結衣', '大和', '葵', '悠真', '凛', '湊', 'さくら', '樹', '美咲', '颯太', '花', '陸'];
const members = Array.from({ length: MEMBER_COUNT }, (_, i) => {
	const id = `USER-${uuid7()}`;
	const familyName = `【ダミー】${FAMILY[i % FAMILY.length]}`;
	const givenName = GIVEN[(i * 7) % GIVEN.length];
	const title = `${familyName} ${givenName}`;
	const m = {
		id,
		title,
		dailyHours: chance(0.1) ? 6 : 8,
		loadLimitPct: pick([100, 120, 120, 120, 150]),
		active: i < MEMBER_COUNT - 3,
	};
	write(
		folders.members,
		id,
		`${frontmatter({ type: 'user', title, aliases: [title], family_name: familyName, given_name: givenName, daily_hours: m.dailyHours, load_limit_pct: m.loadLimitPct, active: m.active })}\nダミーデータです。`,
	);
	return m;
});
const activeMembers = members.filter((m) => m.active);

// ---- プロジェクト・エピック・タスク ----
const GENRES = [
	['新製品CG', ['設計', 'モデリング', 'テクスチャ', 'ライティング', 'レンダリング', '合成', '納品準備', '修正対応']],
	['基幹システム', ['要件定義', '基本設計', '詳細設計', '実装', '単体テスト', '結合テスト', '移行', '運用準備']],
	['材料研究', ['文献調査', '試料作製', '測定', '解析', '追加試験', '報告書', '特許調査', '評価']],
];
const PROJECT_STATUS = ['進行中', '進行中', '進行中', '進行中', '進行中', '進行中', '受注', '保留', 'クローズ', '提案中'];
const tasks = [];
const projectsData = [];

// 日程（開始日〜期限日。要件4.7）を先に決め、ステータスを日程に合わせる。
// 先行タスクは日程に使われないが、それらしく見えるよう先行の終了後に始める。
// こうすると、わざと入れたもの以外に期限超過・期限超過見込みが出ない
for (let p = 0; p < PROJECT_COUNT; p++) {
	const [genre, phases] = GENRES[p % GENRES.length];
	const id = `PJT-${uuid7()}`;
	const title = `【ダミー】${genre}${String.fromCharCode(65 + p)}`;
	const status = PROJECT_STATUS[p];
	// クローズしたプロジェクトは過去に終わったものにする
	const start = status === 'クローズ' ? addDays(TODAY, -int(240, 300)) : addDays(TODAY, -int(30, 90));
	const team = sample(activeMembers, int(6, 12));
	const epicCount = int(...EPICS_PER_PROJECT);
	const epics = [];

	for (let e = 0; e < epicCount; e++) {
		const epic = { id: `EPIC-${uuid7()}`, title: `【ダミー】${phases[e % phases.length]}`, phase: phases[e % phases.length], wbs: String(e + 1), tasks: [] };
		// エピックは工程順に少しずつずらして始める
		epic.start = addDays(start, Math.floor((e * 120) / epicCount));
		let previous = null;
		const taskCount = int(...TASKS_PER_EPIC);
		for (let t = 0; t < taskCount; t++) {
			const task = {
				id: `TASK-${uuid7()}`,
				title: `【ダミー】${epic.phase} ${t + 1}`,
				project: id,
				epic,
				wbs: String(t + 1),
				assignees: sample(team, 1),
				dependsOn: previous && chance(0.4) ? [previous] : [],
				subtaskCount: int(0, 4),
				projectStatus: status,
			};
			task.schedStart =
				task.dependsOn.length > 0 ? nextWorkday(addWorkdays(previous.schedEnd, int(0, 2))) : nextWorkday(addDays(epic.start, int(0, 40)));
			// 期限日が見込み終了日になる
			task.schedEnd = addWorkdays(task.schedStart, int(1, 8) - 1);
			task.due = task.schedEnd;
			// ステータスは日程に合わせる（終わっているはず→完了、途中→進行中など、まだ→未着手）
			task.status =
				status === 'クローズ' || task.schedEnd < TODAY
					? '完了'
					: task.schedStart <= TODAY
						? pick(['進行中', '進行中', 'レビュー待ち', '差し戻し'])
						: pick(['未着手', '未着手', '未着手', '未着手', '保留']);
			epic.tasks.push(task);
			tasks.push(task);
			previous = task;
		}
		epics.push(epic);
	}
	projectsData.push({ id, title, status, start, team, epics, index: p });
}

// ---- 作業ログ（メンバー×月）。稼働日ごとに、日程の期間中の担当タスクへ予定を割り振り、今日より前は実績も入れる ----
let entryCount = 0;
/** `taskId` → 予定・実績の合計。`project|month|member` → 予定の合計 */
const taskHours = new Map();
const allocationPlanned = new Map();
const logs = [];
for (const m of activeMembers) {
	const mine = tasks.filter((t) => t.assignees.includes(m) && t.projectStatus !== '提案中');
	for (const month of LOG_MONTHS) {
		const rows = [];
		for (let day = 1; day <= 31; day++) {
			const date = `${month}-${String(day).padStart(2, '0')}`;
			if (fmt(toDate(date)) !== date) continue;
			// 休日はまれに休日稼働を入れる
			if (!isWorkday(date) && !chance(0.02)) continue;
			const candidates = mine.filter((t) => t.schedStart <= date && date <= t.schedEnd);
			if (candidates.length === 0) continue;
			const chosen = sample(candidates, int(1, 3));
			// 負荷率にばらつきを出す（低め〜超過気味）
			let remaining = m.dailyHours * pick([0.6, 0.8, 1, 1, 1, 1.2, 1.4]);
			chosen.forEach((t, i) => {
				const planned = i === chosen.length - 1 ? Math.max(0.25, Math.round(remaining * 4) / 4) : quarter(1, Math.max(1, remaining - 1));
				remaining -= planned;
				const actual = date < TODAY ? Math.max(0, Math.round((planned + (random() - 0.5) * 2) * 4) / 4) : null;
				rows.push(`| ${date} | ${cellLink(t.id, t.title)} | ${planned} | ${actual ?? ''} |  |`);
				const h = taskHours.get(t.id) ?? { planned: 0, actual: 0 };
				taskHours.set(t.id, { planned: h.planned + planned, actual: h.actual + (actual ?? 0) });
				const key = `${t.project}|${month}|${m.id}`;
				allocationPlanned.set(key, (allocationPlanned.get(key) ?? 0) + planned);
			});
		}
		if (rows.length === 0) continue;
		entryCount += rows.length;
		logs.push({ id: `${m.id}_${month}`, member: m, month, rows });
	}
}

// 見積は予定・実績の合計より少し多めにする（工数超過を出さない）。作業ログの無いタスクは適当な値
const ceilQuarter = (h) => Math.ceil(h * 4) / 4;
for (const t of tasks) {
	const h = taskHours.get(t.id);
	t.estimate = h ? Math.max(2, ceilQuarter(Math.max(h.planned, h.actual) * (1.05 + random() * 0.3))) : quarter(2, 40);
}

// ---- わざと入れる警告（クローズ以外のプロジェクトに、期限超過・工数超過・期限超過見込みを1件ずつ） ----
const injected = [];
for (const pd of projectsData) {
	if (pd.status === 'クローズ') continue;
	const own = pd.epics.flatMap((e) => e.tasks);
	const middle = pd.epics[Math.floor(pd.epics.length / 2)];
	const overdue = sample(own.filter((t) => t.status === '完了' && t.due < TODAY && t.epic !== middle), 1)[0];
	if (overdue) {
		overdue.status = '進行中';
		injected.push(`${pd.title}：期限超過「${overdue.title}」`);
	}
	const over = sample(own.filter((t) => t !== overdue && (taskHours.get(t.id)?.actual ?? 0) >= 2), 1)[0];
	if (over) {
		over.estimate = Math.max(0.25, Math.floor(taskHours.get(over.id).actual * 0.7 * 4) / 4);
		injected.push(`${pd.title}：工数超過「${over.title}」`);
	}
	// 期限超過見込みは、期限日が開始日より前のときだけ出る（まだ期限日を過ぎていないもの）
	const risk = sample(own.filter((t) => t.status !== '完了' && t.status !== '保留' && t.schedStart >= addDays(TODAY, 7)), 1)[0];
	if (risk) {
		risk.due = addDays(risk.schedStart, -int(1, 3));
		injected.push(`${pd.title}：期限超過見込み「${risk.title}」`);
	}
	pd.overAllocation = OVER_ALLOCATION_PROJECTS.has(pd.index);
}

// ---- ノートを書く ----
for (const pd of projectsData) {
	const { id, title, status, start, team, epics } = pd;
	for (const epic of epics) {
		const ends = epic.tasks.map((t) => t.schedEnd).sort();
		epic.due = addDays(ends[ends.length - 1] ?? epic.start, int(0, 5));
		const statuses = epic.tasks.map((t) => t.status);
		epic.status = statuses.every((s) => s === '完了') ? '完了' : statuses.some((s) => s !== '未着手' && s !== '保留') ? '進行中' : '未着手';
		write(
			folders.epics,
			epic.id,
			`${frontmatter({ type: 'epic', title: epic.title, aliases: [epic.title], project: link(id), status: epic.status, wbs: epic.wbs, start: epic.start, due: epic.due, inputs: ['前工程の成果物'], outputs: [`${epic.phase}の成果物`] })}\nダミーデータです。`,
		);
		for (const t of epic.tasks) {
			const done = t.status === '完了';
			const checklist = Array.from({ length: t.subtaskCount }, (_, i) => `- [${done || chance(0.4) ? 'x' : ' '}] 作業 ${i + 1}`);
			write(
				folders.tasks,
				t.id,
				`${frontmatter({
					type: 'task',
					title: t.title,
					aliases: [t.title],
					project: link(id),
					epic: link(epic.id),
					wbs: t.wbs,
					status: t.status,
					assignees: t.assignees.map((m) => link(m.id)),
					estimate: t.estimate,
					depends_on: t.dependsOn.map((d) => link(d.id)),
					start: t.schedStart,
					due: t.due,
				})}\nダミーデータです。\n\n${checklist.join('\n')}`,
			);
		}
	}
	const due = addDays(epics.map((e) => e.due).sort().pop(), int(5, 20));

	// マイルストーン（エピックの完了予定日に連動するものと、しないもの）と工数配分
	const middle = epics[Math.floor(epics.length / 2)];
	const milestoneRows = [`| 中間レビュー | ${middle.due} | ${cellLink(middle.id, middle.title)} |`, `| 納品 | ${due} |  |`];
	// 配分は予定の合計より少し多め。配分超過を入れるプロジェクトは、予定のある1か所だけ少なくする
	const allocationRows = [];
	let overDone = !pd.overAllocation;
	for (const month of LOG_MONTHS) {
		for (const m of team) {
			const planned = allocationPlanned.get(`${id}|${month}|${m.id}`) ?? 0;
			let hours = planned > 0 ? Math.ceil((planned * 1.15) / 5) * 5 : int(2, 6) * 5;
			if (!overDone && planned >= 10) {
				hours = Math.floor((planned * 0.8) / 5) * 5;
				overDone = true;
				injected.push(`${title}：配分超過（${month} ${m.title}）`);
			}
			allocationRows.push(`| ${month} | ${cellLink(m.id, m.title)} | ${hours} |`);
		}
	}
	write(
		folders.projects,
		id,
		[
			frontmatter({
				type: 'project',
				title,
				aliases: [title],
				case_id: `P2026-${String(pd.index + 1).padStart(3, '0')}`,
				official_name: `${title}（正式名）`,
				status,
				start,
				due,
				manager: link(pick(team).id),
			}),
			'ダミーデータです。',
			'',
			'## マイルストーン',
			'| 名前 | 日付 | 連動エピック |',
			'| --- | --- | --- |',
			...milestoneRows,
			'',
			'## 工数配分',
			'| 月 | メンバー | 配分(h) |',
			'| --- | --- | --- |',
			...allocationRows,
		].join('\n'),
	);
}

// ---- 健全性チェックの確認用に、わざと誤りを入れたノートを少しだけ作る ----
const broken = [
	['存在しない担当者', { status: '未着手', project: link(tasks[0].project), assignees: [link(`USER-${uuid7()}`)] }],
	['設定に無いステータス', { status: '検討中', project: link(tasks[0].project) }],
	['プロジェクトなし', { status: '未着手' }],
	['見積が0.25刻みでない', { status: '未着手', project: link(tasks[0].project), estimate: 1.1 }],
	['日付の書式違い', { status: '未着手', project: link(tasks[0].project), due: '2026/12/01' }],
];
const brokenIds = new Map();
for (const [name, fields] of broken) {
	const id = `TASK-${uuid7()}`;
	const title = `【ダミー・誤り】${name}`;
	brokenIds.set(name, { id, title });
	write(folders.tasks, id, `${frontmatter({ type: 'task', title, aliases: [title], ...fields })}\n健全性チェックの確認用に、わざと誤りを入れたダミーデータです。`);
}

// 作業ログの誤り（読み飛ばされる行）。プロジェクトの集計に入らないよう「プロジェクトなし」のタスクに付ける
const month = TODAY.slice(0, 7);
const brokenLog = logs.find((l) => l.month === month);
if (brokenLog) {
	const target = brokenIds.get('プロジェクトなし');
	const cell = cellLink(target.id, target.title);
	brokenLog.rows.push(`| ${addMonths(month, 1)}-01 | ${cell} | 4 |  | わざと対象月の外 |`, `| ${month}-02 | ${cell} | 1.1 |  | わざと0.25刻みでない |`);
}

for (const log of logs) {
	write(
		folders.logs,
		log.id,
		[
			frontmatter({ type: 'worklog', member: link(log.member.id), month: log.month }),
			'## 作業ログ',
			'| 日付 | タスク | 予定(h) | 実績(h) | メモ |',
			'| --- | --- | --- | --- | --- |',
			...log.rows,
		].join('\n'),
	);
}

for (const [file, content] of files) {
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, content);
}
const projects = PROJECT_COUNT;
console.log(
	`ダミーデータを ${files.size} 件作りました（メンバー ${MEMBER_COUNT}、プロジェクト ${projects}、タスク ${tasks.length}＋誤り ${broken.length}、作業ログの行 ${entryCount}＋誤り ${brokenLog ? 2 : 0}${brokenLog ? `（${brokenLog.member.title} の ${month}）` : ''}）`,
);
console.log(`基準日: ${TODAY}（この日に開くと、わざと入れた警告だけが出ます。日がたつと期限超過が増えます）`);
console.log(`わざと入れた警告 ${injected.length} 件:\n  ${injected.join('\n  ')}`);
console.log(`場所: ${vault}`);
