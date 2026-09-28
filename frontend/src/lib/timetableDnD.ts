import { BangumiItem, WatchType } from '@/services/bangumiService';

const TIMELINE_START_HOUR = 18;
const SLOTS_PER_HOUR = 3;
const MINUTES_PER_SLOT = 20;

const LANE_WATCH_TYPES: Record<string, WatchType> = {
  backlog: WatchType.LONG_GRASS,
  meal: WatchType.MEAL,
  reading: WatchType.LEISURE,
};

export type TimetableDropPatch = Pick<
  BangumiItem,
  'duration' | 'watch_day' | 'watch_time' | 'watch_type'
>;

export const getScheduleItemKey = (item: BangumiItem): string =>
  `${item.subject.source}-${item.subject.source_id}`;

export const getDraggedItemKey = (dragId: string): string =>
  dragId.replace(/^(panel-|board-|timeline-)/, '');

export const getTimetableDropPatch = (
  targetId: string,
): TimetableDropPatch | null => {
  const laneMatch = /^lane-([^-]+)-([0-6])$/.exec(targetId);
  if (laneMatch) {
    const watchType = LANE_WATCH_TYPES[laneMatch[1].toLocaleLowerCase()];
    if (!watchType) return null;

    return {
      duration: 1,
      watch_day: Number(laneMatch[2]),
      watch_time: '',
      watch_type: watchType,
    };
  }

  const timelineMatch = /^([0-6])-(\d+)$/.exec(targetId);
  if (!timelineMatch) return null;

  const visualDay = Number(timelineMatch[1]);
  const slotIndex = Number(timelineMatch[2]);
  const hour = TIMELINE_START_HOUR + Math.floor(slotIndex / SLOTS_PER_HOUR);
  const minute = (slotIndex % SLOTS_PER_HOUR) * MINUTES_PER_SLOT;
  const watchDay = hour >= 24 ? (visualDay + 1) % 7 : visualDay;
  const displayHour = hour >= 24 ? hour - 24 : hour;

  return {
    duration: 1,
    watch_day: watchDay,
    watch_time: `${displayHour.toString().padStart(2, '0')}:${minute
      .toString()
      .padStart(2, '0')}`,
    watch_type: WatchType.NEW,
  };
};
