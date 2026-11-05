import type { IsoDate } from './common';

export interface Holiday {
	date: IsoDate;
	/** 祝日名など（表示用） */
	name: string;
}

/** `_pm/calendar.json` の内容。全社共通の休日だけを持つ（個人休日はメンバーのノート） */
export interface Calendar {
	/** 土日を休日とするか */
	weekendsOff: boolean;
	holidays: Holiday[];
}
