/** SVG の要素を作る部品（グラフ・ガントの依存の線で共通） */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** SVG の要素を作り、属性とクラスを付けて parent の最後に足す */
export function svg<K extends keyof SVGElementTagNameMap>(parent: Element, tag: K, attrs: Record<string, string | number> = {}, cls?: string): SVGElementTagNameMap[K] {
	const el = document.createElementNS(SVG_NS, tag);
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
	if (cls) el.classList.add(...cls.split(' '));
	parent.appendChild(el);
	return el;
}
