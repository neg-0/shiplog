import { formatRelativeDate } from './utils';

describe('formatRelativeDate', () => {
  it('returns null for null input', () => {
    expect(formatRelativeDate(null)).toBeNull();
  });

  it('returns "today" for current date', () => {
    const now = new Date().toISOString();
    expect(formatRelativeDate(now)).toBe('today');
  });

  it('returns "yesterday" for one day ago', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatRelativeDate(yesterday.toISOString())).toBe('yesterday');
  });

  it('returns "X days ago" for 2-6 days ago', () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    expect(formatRelativeDate(threeDaysAgo.toISOString())).toBe('3 days ago');

    const sixDaysAgo = new Date();
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
    expect(formatRelativeDate(sixDaysAgo.toISOString())).toBe('6 days ago');
  });

  it('returns "X weeks ago" for 7-29 days ago', () => {
    // Use midnight-based dates to avoid fractional day rounding issues
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 15);
    expect(formatRelativeDate(twoWeeksAgo.toISOString())).toBe('2 weeks ago');

    const threeWeeksAgo = new Date(now);
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 22);
    expect(formatRelativeDate(threeWeeksAgo.toISOString())).toBe('3 weeks ago');
  });

  it('returns "X months ago" for 30+ days ago', () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const twoMonthsAgo = new Date(now);
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 61);
    expect(formatRelativeDate(twoMonthsAgo.toISOString())).toBe('2 months ago');

    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 181);
    expect(formatRelativeDate(sixMonthsAgo.toISOString())).toBe('6 months ago');
  });
});
