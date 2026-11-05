/** 並べ替えの文字の比較。比較器は1つを使い回す（設計書 11章） */

const JA = new Intl.Collator('ja');
const JA_NUMERIC = new Intl.Collator('ja', { numeric: true });

/** 日本語の名前の比較（氏名・タイトル） */
export const compareJa = (a: string, b: string): number => JA.compare(a, b);

/** 数字の部分を数として比べる（「タスク2」が「タスク10」より前、WBS番号 1.2 が 1.10 より前） */
export const compareNumeric = (a: string, b: string): number => JA_NUMERIC.compare(a, b);
