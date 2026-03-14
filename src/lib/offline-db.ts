import Dexie, { Table } from 'dexie';

export interface OfflineProfile {
  user_id: string;
  full_name: string;
  face_embedding: number[];
  department?: string;
  designation?: string;
}

export interface PendingAttendance {
  id?: number;
  user_id: string;
  full_name: string;
  check_in_at: string;
  latitude: number;
  longitude: number;
  status: 'present' | 'late';
  match_score: number;
  synced: boolean;
  face_embedding?: number[];
}

export class OfflineDB extends Dexie {
  profiles!: Table<OfflineProfile>;
  attendance_logs!: Table<PendingAttendance>;

  constructor() {
    super('NasidaOfflineDB');
    this.version(1).stores({
      profiles: 'user_id, full_name', // Primary key is user_id
      attendance_logs: '++id, user_id, synced' // Auto-incrementing ID
    });
  }
}

export const db = new OfflineDB();
