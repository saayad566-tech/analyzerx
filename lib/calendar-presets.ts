export type QuickCalendarDays = 7 | 30 | 90;

export function quickCalendarRange(days: QuickCalendarDays, today = new Date()) {
  const end = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const format = (date: Date) =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

  return { startDate: format(start), endDate: format(end) };
}


export type CalendarKeyboardShortcut = "ArrowLeft" | "ArrowRight" | "PageUp" | "PageDown";

export function shiftCalendarMonth(month: Date, amount: number) {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + amount, 1));
}

export function calendarMonthForShortcut(month: Date, shortcut: CalendarKeyboardShortcut) {
  const amount = shortcut === "ArrowLeft" ? -1 : shortcut === "ArrowRight" ? 1 : shortcut === "PageUp" ? -12 : 12;
  return shiftCalendarMonth(month, amount);
}
