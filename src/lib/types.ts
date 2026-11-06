export type Kind = 'task' | 'idea';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'any';
export type Priority = 'high' | 'medium' | 'low';
export type Category =
  | 'work'
  | 'business'
  | 'health'
  | 'money'
  | 'family'
  | 'personal'
  | 'learning'
  | 'errands';

/** Shape Claude returns for each thing it pulled out of the brain dump. */
export interface AiItem {
  kind: Kind;
  title: string;
  note: string;
  category: Category;
  emoji: string;
  priority: Priority;
  deadline: string; // YYYY-MM-DD or ""
  earliest_date: string; // YYYY-MM-DD
  latest_date: string; // YYYY-MM-DD
  time_of_day: TimeOfDay;
  duration_minutes: number;
  clarifying_question: string; // "" if none
  idea_angle: string; // ideas only, "" for tasks
  next_steps: string[]; // ideas only, [] for tasks
}

export interface AiResult {
  summary: string;
  items: AiItem[];
}

export interface Slot {
  start: string; // ISO datetime
  end: string;
}

export interface Step {
  text: string;
  done: boolean;
}

export interface SiftItem {
  id: string;
  kind: Kind;
  title: string;
  note: string;
  category: Category;
  emoji: string;
  priority: Priority;
  deadline: string;
  earliest: string;
  latest: string;
  timeOfDay: TimeOfDay;
  durationMin: number;
  question: string;
  angle: string;
  steps: Step[];
  status: 'scheduled' | 'unscheduled' | 'done' | 'archived';
  slot: Slot | null;
  eventId: string | null;
  createdAt: string;
}

export interface Settings {
  name: string;
  apiKey: string;
  googleClientId: string;
  dayStart: number; // hour, 0-23
  dayEnd: number;
}

export interface Interval {
  start: number; // ms
  end: number;
}

export interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  fromSift: boolean;
}
