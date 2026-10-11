import { localDate, monthDates } from './domain.mjs';

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && localDate(new Date(`${value}T12:00:00`)) === value;
const endForOverlap = record => record.endDate || '9999-12-31';
export function validatePeriod(record, records = [], today = localDate()) {
  if (!validDate(record.startDate)) return '请选择有效的开始日期。';
  if (record.startDate > today) return '开始日期不能晚于今天。';
  if (record.endDate && !validDate(record.endDate)) return '请选择有效的结束日期。';
  if (record.endDate && record.endDate < record.startDate) return '结束日期不能早于开始日期。';
  if (record.endDate && record.endDate > today) return '结束日期不能晚于今天。';
  if (typeof record.note !== 'string' || record.note.length > 2000) return '备注最多填写 2000 个字。';
  if (records.some(other => (!record.id || other.id !== record.id) && record.startDate <= endForOverlap(other) && other.startDate <= endForOverlap(record)))
    return '日期与已有经期记录重叠，请先调整原记录。';
  return '';
}
export function periodDayCount(record, today = localDate()) {
  const end = record.endDate || today;
  return Math.max(0, Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${record.startDate}T12:00:00Z`)) / 86400000) + 1);
}
export function periodSummary(records = [], month, today = localDate()) {
  const dates = monthDates(month);
  const periods = records.filter(record => record.startDate <= dates[dates.length - 1] && (record.endDate || today) >= dates[0] && record.startDate <= today)
    .slice().sort((a,b) => b.startDate.localeCompare(a.startDate));
  const days = dates.filter(date => date <= today && periods.some(record => date >= record.startDate && date <= (record.endDate || today)));
  return { records: periods, days, dayCount: days.length };
}
