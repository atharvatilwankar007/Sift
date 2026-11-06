import type { Category } from './types';

export const CATEGORIES: Record<Category, { label: string; color: string; gcal: string }> = {
  work: { label: 'Work', color: '#8FB3FF', gcal: '9' },
  business: { label: 'Business', color: '#C2B0F2', gcal: '3' },
  health: { label: 'Health', color: '#7FD8A8', gcal: '10' },
  money: { label: 'Money', color: '#F2C46D', gcal: '5' },
  family: { label: 'Family', color: '#F29CB5', gcal: '4' },
  personal: { label: 'Personal', color: '#7CC9D9', gcal: '7' },
  learning: { label: 'Learning', color: '#B9C4D6', gcal: '1' },
  errands: { label: 'Errands', color: '#F0A47A', gcal: '6' },
};

export function catOf(c: string) {
  return CATEGORIES[c as Category] ?? CATEGORIES.personal;
}
