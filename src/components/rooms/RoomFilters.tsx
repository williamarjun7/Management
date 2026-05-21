import { Search } from 'lucide-react';
import type { Room } from '../../types';

export interface FiltersState {
  search: string;
  status: string;
  roomType: string;
}

interface RoomFiltersProps {
  filters: FiltersState;
  onChange: (filters: FiltersState) => void;
  roomTypes?: { id: string; name: string }[];
  capacity: string;
  onCapacityChange: (value: string) => void;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'maintenance', label: 'Maintenance' },
];

const CAPACITY_OPTIONS = [
  { value: 'all', label: 'Any Capacity' },
  { value: '1', label: '1 Guest' },
  { value: '2', label: '2 Guests' },
  { value: '3', label: '3 Guests' },
  { value: '4', label: '4+ Guests' },
];

export function RoomFilters({ filters, onChange, roomTypes, capacity, onCapacityChange }: RoomFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search rooms..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="w-full rounded-lg border bg-background pl-9 pr-4 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <select
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value })}
        className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {roomTypes && roomTypes.length > 0 && (
        <select
          value={filters.roomType}
          onChange={(e) => onChange({ ...filters, roomType: e.target.value })}
          className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="all">All Types</option>
          {roomTypes.map((rt) => (
            <option key={rt.id} value={rt.id}>{rt.name}</option>
          ))}
        </select>
      )}

      <select
        value={capacity}
        onChange={(e) => onCapacityChange(e.target.value)}
        className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      >
        {CAPACITY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

export function applyFilters(rooms: Room[], filters: FiltersState, capacityFilter: string): Room[] {
  return rooms.filter((room) => {
    if (filters.search && !room.room_number.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.status !== 'all' && room.status !== filters.status) {
      return false;
    }
    if (filters.roomType !== 'all' && room.room_type_id !== filters.roomType) {
      return false;
    }
    if (capacityFilter !== 'all') {
      const max = room.room_types?.max_guests ?? 0;
      const capNum = parseInt(capacityFilter, 10);
      if (capacityFilter === '4') {
        if (max < 4) return false;
      } else if (max !== capNum) {
        return false;
      }
    }
    return true;
  });
}
