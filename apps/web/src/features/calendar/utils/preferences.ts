import { createSharedRoot } from '@solid-primitives/rootless';
import { makePersisted } from '@solid-primitives/storage';
import { createStore } from 'solid-js/store';
import {
  CALENDAR_PREFERENCES_KEY,
  getPreferredCalendarPeriodView,
} from '../calendar-preferences';
import {
  type CalendarPeriodView,
  type CalendarTimeFormat,
  type CalendarWeekStart,
  TEAM_OOO_SOURCE_ID,
} from '../types';
import { getDefaultCalendarTimeFormat } from './time-format';

interface CalendarPreferences {
  periodView: CalendarPeriodView;
  hiddenSourceIds: string[];
  sourceColors: Record<string, string | undefined>;
  accountColors: Record<string, string | undefined>;
  showWeekends: boolean;
  weekStartsOn: CalendarWeekStart;
  timeFormat: CalendarTimeFormat;
}

/** One persisted store, so preference changes reach invitation cards outside the calendar. */
export const useCalendarPreferences = createSharedRoot(() => {
  const defaultPreferences: CalendarPreferences = {
    periodView: getPreferredCalendarPeriodView(),
    hiddenSourceIds: [],
    sourceColors: {},
    accountColors: {},
    showWeekends: true,
    weekStartsOn: 0,
    timeFormat: getDefaultCalendarTimeFormat(),
  };
  const [preferences, setPreferences] = makePersisted(
    createStore<CalendarPreferences>(defaultPreferences),
    {
      name: CALENDAR_PREFERENCES_KEY,
      deserialize: (value) => {
        const stored = JSON.parse(value) as Partial<CalendarPreferences>;
        return {
          ...defaultPreferences,
          ...stored,
          // Team out of office has no off switch; an older saved hide would
          // otherwise keep it off for good.
          hiddenSourceIds: (stored.hiddenSourceIds ?? []).filter(
            (id) => id !== TEAM_OOO_SOURCE_ID
          ),
        };
      },
    }
  );
  return [preferences, setPreferences] as const;
});
