import { openDB, type IDBPDatabase } from 'idb';
import type { BoardItem } from '@/lib/whiteboard';

const DATABASE_NAME = 'workx-whiteboard';
const DATABASE_VERSION = 1;
const BOARD_KEY = 'main';

export interface WhiteboardDocument {
  id: typeof BOARD_KEY;
  items: BoardItem[];
  updatedAt: number;
}

let databasePromise: Promise<IDBPDatabase> | null = null;

function getDatabase(): Promise<IDBPDatabase> {
  if (!databasePromise) {
    databasePromise = openDB(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('boards')) {
          database.createObjectStore('boards', { keyPath: 'id' });
        }
      },
    });
  }
  return databasePromise;
}

export async function loadWhiteboard(): Promise<BoardItem[]> {
  const database = await getDatabase();
  const document = await database.get('boards', BOARD_KEY) as WhiteboardDocument | undefined;
  return document?.items ?? [];
}

export async function saveWhiteboard(items: BoardItem[]): Promise<void> {
  const database = await getDatabase();
  await database.put('boards', { id: BOARD_KEY, items, updatedAt: Date.now() } satisfies WhiteboardDocument);
}

export async function clearWhiteboard(): Promise<void> {
  const database = await getDatabase();
  await database.delete('boards', BOARD_KEY);
}