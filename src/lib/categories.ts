import type { Category } from './types';

export const CATEGORIES: Record<Category, { label: string; color: string; gcal: string }> = {
  work: { label: 'Work', color: '#6C8CFF', gcal: '9' },
  business: { label: 'Business', color: '#A07CFF', gcal: '3' },
  health: { label: 'Health', color: '#3DDC97', gcal: '10' },
  money: { label: 'Money', color: '#FFB547', gcal: '5' },
  family: { label: 'Family', color: '#FF7AA8', gcal: '4' },
  personal: { label: 'Personal', color: '#3DD9FF', gcal: '7' },
  learning: { label: 'Learning', color: '#C6A0FF', gcal: '1' },
  errands: { label: 'Errands', color: '#FF8A5C', gcal: '6' },
};

export function catOf(c: string) {
  return CATEGORIES[c as Category] ?? CATEGORIES.personal;
}
