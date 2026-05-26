import { openDB, type IDBPDatabase } from 'idb';
import type { Page } from '@/types/editor';

const DB_NAME = 'workx-db';
const DB_VERSION = 1;
const PAGES_STORE = 'pages';
const MEDIA_STORE = 'media';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(PAGES_STORE)) {
          db.createObjectStore(PAGES_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
          db.createObjectStore(MEDIA_STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function savePageToDB(page: Page) {
  const db = await getDB();
  await db.put(PAGES_STORE, { ...page, updatedAt: Date.now() });
}

export async function loadAllPages(): Promise<Page[]> {
  const db = await getDB();
  return db.getAll(PAGES_STORE);
}

export async function deletePageFromDB(id: string) {
  const db = await getDB();
  await db.delete(PAGES_STORE, id);
}

export async function saveMedia(id: string, blob: Blob): Promise<string> {
  const db = await getDB();
  await db.put(MEDIA_STORE, blob, id);
  return id;
}

export async function loadMedia(id: string): Promise<Blob | undefined> {
  const db = await getDB();
  return db.get(MEDIA_STORE, id);
}

export async function deleteMedia(id: string) {
  const db = await getDB();
  await db.delete(MEDIA_STORE, id);
}
