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

/* ---------- What the AI returns ---------- */

/** A brand-new thing pulled out of a brain dump. */
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
  specific_time: string; // "HH:MM" if the user named a time, else ""
  time_of_day: TimeOfDay;
  duration_minutes: number;
  clarifying_question: string; // "" if none
  user_take: string; // ideas: the user's own idea in their words, cleaned up
  user_steps: string[]; // ideas: steps the USER said themselves
  suggested_steps: string[]; // ideas: Sift's suggestions (user decides)
  idea_angle: string; // ideas: one-line sharp angle, "" for tasks
}

/** A change to something that already exists ("move the café thing to Sunday"). */
export interface AiUpdate {
  target_id: string;
  action: 'edit' | 'complete' | 'cancel' | 'add_to_idea';
  change_summary: string; // human readable, e.g. "Moved to Sunday 5 PM"
  title: string; // "" = unchanged
  note_append: string;
  earliest_date: string;
  latest_date: string;
  specific_time: string;
  time_of_day: TimeOfDay | '';
  deadline: string;
  add_user_steps: string[];
}

export interface AiResult {
  summary: string;
  creates: AiItem[];
  updates: AiUpdate[];
}

/* ---------- What the app stores ---------- */

export interface Slot {
  start: string; // ISO datetime
  end: string;
}

export interface Step {
  id: string;
  text: string;
  done: boolean;
  source: 'mine' | 'suggested';
  accepted: boolean; // suggestions start unaccepted until you keep them
}

export interface OnePager {
  problem: string;
  audience: string;
  insight: string;
  risks: string;
  experiment: string;
}

export interface QA {
  q: string;
  a: string;
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
  specificTime: string;
  timeOfDay: TimeOfDay;
  durationMin: number;
  question: string;
  status: 'scheduled' | 'unscheduled' | 'done' | 'archived';
  slot: Slot | null;
  eventId: string | null;
  createdAt: string;
  updatedAt: string;
  // ideas
  angle: string;
  take: string;
  steps: Step[];
  stage: 'active' | 'parked' | 'killed';
  onePager: OnePager | null;
  qa: QA[];
  notes: string[];
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
