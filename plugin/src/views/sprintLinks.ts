import { linkPath, linkRoute, type LinkShape, type Span } from '../calc/linkPath';
import type { SprintLink } from '../calc/sprintBoard';
import type { NoteId } from '../model';
import { svg } from './svg';

/** 矢印の大きさ(px)。線の太さによらず同じ */
const ARROW_SIZE = 7;

/** 線の矢印の ID を、ビューごとに分ける */
let arrowCount = 0;

/** そのタスクの線を目立たせ、ほかを薄くする。undefined で元に戻す */
export function focusLinks(card: HTMLElement, id: NoteId | undefined): void {
	const root = card.closest('.pm-sprint-board')?.querySelector('.pm-sprint-links');
	if (!root) return;
	root.classList.toggle('has-focus', id !== undefined);
	for (const path of Array.from(root.querySelectorAll<SVGPathElement>('.pm-sprint-link'))) {
		path.classList.toggle('is-focus', id !== undefined && (path.dataset.from === id || path.dataset.to === id));
	}
}

/**
 * スプリントのボードに依存の線を引く（設計書 9.16）。戻り値で引き直す。
 * 出していないカード（たたんだ列・「さらに表示」の外）には引かない。道筋は linkRoute
 */
export function drawLinks(board: HTMLElement, links: readonly SprintLink[], cards: ReadonlyMap<NoteId, HTMLElement>, shape: LinkShape): () => void {
	const root = svg(board, 'svg', {}, 'pm-sprint-links');
	const defs = svg(root, 'defs');
	const id = ++arrowCount;
	const marker = (name: string, cls: string) => {
		const m = svg(
			defs,
			'marker',
			{ id: name, viewBox: '0 0 6 6', refX: 6, refY: 3, markerWidth: ARROW_SIZE, markerHeight: ARROW_SIZE, markerUnits: 'userSpaceOnUse', orient: 'auto' },
			cls,
		);
		svg(m, 'path', { d: 'M0,0 L6,3 L0,6 Z' });
	};
	const normal = `pm-sprint-arrow-${id}`;
	const reversed = `pm-sprint-arrow-rev-${id}`;
	marker(normal, 'pm-sprint-arrow');
	marker(reversed, 'pm-sprint-arrow is-reversed');
	const group = svg(root, 'g');

	const draw = () => {
		group.empty();
		root.setAttribute('width', String(board.scrollWidth));
		root.setAttribute('height', String(board.scrollHeight));
		const base = board.getBoundingClientRect();
		const box = (el: Element) => {
			const r = el.getBoundingClientRect();
			return { left: r.left - base.left, right: r.right - base.left, y: r.top - base.top + r.height / 2 };
		};
		// 行ごとのカードの左右の位置と、線の通り道（マスの上の余白の真ん中）
		const rows = new Map<Element, { spans: Span[]; laneY: number }>();
		const rowOf = (row: Element) => {
			let info = rows.get(row);
			if (!info) {
				const cell = row.querySelector('.pm-sprint-cell');
				const padding = cell ? parseFloat(getComputedStyle(cell).paddingTop) : 0;
				info = { spans: Array.from(row.querySelectorAll('.pm-kanban-card')).map(box), laneY: row.getBoundingClientRect().top - base.top + padding / 2 };
				rows.set(row, info);
			}
			return info;
		};
		for (const link of links) {
			const fromEl = cards.get(link.from);
			const toEl = cards.get(link.to);
			const row = fromEl?.closest('.pm-sprint-row');
			if (!fromEl || !toEl || !row) continue;
			const { spans, laneY } = rowOf(row);
			const d = linkPath(linkRoute(box(fromEl), box(toEl), spans, laneY), shape);
			const path = svg(group, 'path', { d, 'marker-end': `url(#${link.reversed ? reversed : normal})` }, 'pm-sprint-link');
			if (link.reversed) path.classList.add('is-reversed');
			path.dataset.from = link.from;
			path.dataset.to = link.to;
		}
	};
	draw();
	return draw;
}
