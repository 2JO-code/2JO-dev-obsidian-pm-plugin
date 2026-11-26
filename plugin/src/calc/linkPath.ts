/** 依存の線の形（設計書 9.16）。square：直角に折る、curve：折れ目を丸める */
export type LinkShape = 'square' | 'curve';

export const LINK_SHAPES: readonly LinkShape[] = ['square', 'curve'];

export const LINK_SHAPE_LABELS: Record<LinkShape, string> = { square: '直角', curve: '曲線' };

export type Point = readonly [x: number, y: number];

/** 折れ目を丸めるときの半径の上限(px) */
const CORNER_RADIUS = 8;

const same = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;

/** 前後と一直線に並ぶ点・重なる点を除く（折れ目だけを残す） */
function corners(points: readonly Point[]): Point[] {
	const unique = points.filter((p, i) => i === 0 || !same(p, points[i - 1] ?? p));
	return unique.filter((p, i) => {
		const a = unique[i - 1];
		const b = unique[i + 1];
		if (!a || !b) return true;
		return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) !== 0;
	});
}

const round = (n: number) => Math.round(n * 10) / 10;
const pt = (p: Point) => `${round(p[0])},${round(p[1])}`;

/** 点から相手の点へ dist だけ進んだ点 */
function toward(from: Point, to: Point, dist: number): Point {
	const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
	if (len === 0) return from;
	return [from[0] + ((to[0] - from[0]) * dist) / len, from[1] + ((to[1] - from[1]) * dist) / len];
}

/**
 * 点を順に結ぶ SVG の path（d 属性）。curve なら折れ目を丸める（半径は前後の線の長さの半分まで）
 * @param points 始点・折れ目・終点
 */
export function linkPath(points: readonly Point[], shape: LinkShape): string {
	const ps = corners(points);
	const first = ps[0];
	if (!first) return '';
	const parts = [`M${pt(first)}`];
	for (let i = 1; i < ps.length; i++) {
		const p = ps[i] as Point;
		const prev = ps[i - 1] as Point;
		const next = ps[i + 1];
		if (shape === 'square' || !next) {
			parts.push(`L${pt(p)}`);
			continue;
		}
		const r = Math.min(CORNER_RADIUS, Math.hypot(p[0] - prev[0], p[1] - prev[1]) / 2, Math.hypot(next[0] - p[0], next[1] - p[1]) / 2);
		parts.push(`L${pt(toward(p, prev, r))}`, `Q${pt(p)} ${pt(toward(p, next, r))}`);
	}
	return parts.join(' ');
}

/** 線が先行のカードの外へ出てから曲がるまでの幅(px) */
const LINK_OFFSET = 6;
/** 後続のカードの手前の、まっすぐな部分の長さ(px)。折れ目の丸みと矢印のあとに間を残す（設計書 11.24） */
const END_RUN = 22;
/** 縦の線をカードから離す幅(px) */
const CARD_MARGIN = 4;

/** カードの左右の端(px) */
export interface Span {
	left: number;
	right: number;
}

/** 線でつなぐカード。y は縦の真ん中 */
export interface LinkCard extends Span {
	y: number;
}

/** 端 edge から dir の向きに、次のカードまでの空き(px)。無ければ Infinity */
function freeFrom(cards: readonly Span[], edge: number, dir: 1 | -1): number {
	const gaps = cards.map((r) => (dir === 1 ? r.left - edge : edge - r.right)).filter((g) => g > -1);
	return gaps.length > 0 ? Math.max(0, Math.min(...gaps)) : Infinity;
}

/** 空きの中で、端からいくつ離して縦の線を通すか */
const inGap = (free: number, want: number) => Math.max(1, Math.min(want, free - CARD_MARGIN));

/**
 * 依存の線の道筋（設計書 11.24）。縦横の線で、後続の手前は END_RUN だけまっすぐにする。
 * 同じ段なら右のすき間へ出て戻る。間にカードが無ければすき間の中で折る。
 * あればすき間を縦に通り、通り道 laneY（行の上の余白）を横に進む（カードを通らないため）
 * @param cards 同じ行のカード
 */
export function linkRoute(from: LinkCard, to: LinkCard, cards: readonly Span[], laneY: number): Point[] {
	if (Math.abs(from.left - to.left) < 1) {
		const sx = from.right;
		const bx = sx + inGap(freeFrom(cards, sx, 1), END_RUN);
		return [
			[sx, from.y],
			[bx, from.y],
			[bx, to.y],
			[sx, to.y],
		];
	}
	// 先行が左なら右の端から左の端へ。右（順番違い）なら左の端から右の端へ
	const forward = from.left < to.left;
	const dir = forward ? 1 : -1;
	const sx = forward ? from.right : from.left;
	const tx = forward ? to.left : to.right;
	const lo = Math.min(sx, tx);
	const hi = Math.max(sx, tx);
	const blocked = cards.some((r) => r.left >= lo - 1 && r.right <= hi + 1);
	if (!blocked) {
		// 狭ければ真ん中で折る
		const run = hi - lo - END_RUN >= LINK_OFFSET ? END_RUN : (hi - lo) / 2;
		const bend = tx - run * dir;
		return [
			[sx, from.y],
			[bend, from.y],
			[bend, to.y],
			[tx, to.y],
		];
	}
	const gx1 = sx + inGap(freeFrom(cards, sx, dir), LINK_OFFSET) * dir;
	const gx2 = tx - inGap(freeFrom(cards, tx, forward ? -1 : 1), END_RUN) * dir;
	return [
		[sx, from.y],
		[gx1, from.y],
		[gx1, laneY],
		[gx2, laneY],
		[gx2, to.y],
		[tx, to.y],
	];
}
