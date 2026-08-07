/**
 * 房间聚焦辅助：中文名 ↔ RoomId，供语义地图 / 时间轴轻量联动。
 */

import type { RoomId } from '@/types/home';

export const ROOM_NAME_BY_ID: Record<RoomId, string> = {
  living_room: '客厅',
  bedroom: '卧室',
  kitchen: '厨房',
  corridor: '走廊',
};

const NAME_TO_ID: Record<string, RoomId> = {
  客厅: 'living_room',
  卧室: 'bedroom',
  厨房: 'kitchen',
  走廊: 'corridor',
};

/** 从事件文案中解析房间中文名 → RoomId */
export function parseRoomIdFromMessage(message: string): RoomId | null {
  for (const [name, id] of Object.entries(NAME_TO_ID)) {
    if (message.includes(name)) return id;
  }
  return null;
}
