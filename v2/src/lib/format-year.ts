/**
 * V1 风格年份缩写：1997 → '97；2007 → 2007；1985/2010 → '85/2010；1970s → '70s
 * 仅 19xx 缩成两位带前导 '，其它年代原样返回。
 */
export function shortYear(y: string | number | null | undefined): string {
  if (!y) return '';
  return String(y).replace(/(\d{4})(s?)/g, (_m, year: string, suffix: string) => {
    if (year.startsWith('19')) return "'" + year.slice(2) + suffix;
    return year + suffix;
  });
}
