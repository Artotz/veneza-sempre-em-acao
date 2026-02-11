import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DB_NAME = "pwa-photos";
const DB_VERSION = 1;
const PHOTO_STORE = "photos";
const BLOB_STORE = "photoBlobs";

export type OfflinePhotoMeta = {
  id: string;
  createdAt: number;
  mime: string;
  size: number;
  uploaded: boolean;
  remotePath?: string;
  entityRef?: string;
  kind?: string;
  consultantId?: string;
  apontamentoId?: string;
};

export type OfflinePhotoMetaExtras = Partial<
  Pick<OfflinePhotoMeta, "entityRef" | "kind" | "consultantId" | "apontamentoId">
> &
  Record<string, unknown>;

interface PhotoDB extends DBSchema {
  photos: {
    key: string;
    value: OfflinePhotoMeta;
  };
  photoBlobs: {
    key: string;
    value: Blob;
  };
}

let dbPromise: Promise<IDBPDatabase<PhotoDB>> | null = null;

const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB<PhotoDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(PHOTO_STORE)) {
          db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(BLOB_STORE)) {
          db.createObjectStore(BLOB_STORE);
        }
      },
    });
  }

  return dbPromise;
};

export const saveOfflinePhoto = async (
  id: string,
  blob: Blob,
  metaExtras: OfflinePhotoMetaExtras = {}
) => {
  const db = await getDb();
  const metadata: OfflinePhotoMeta = {
    id,
    createdAt: Date.now(),
    mime: blob.type || "image/jpeg",
    size: blob.size,
    uploaded: false,
    ...metaExtras,
  };

  const tx = db.transaction([PHOTO_STORE, BLOB_STORE], "readwrite");
  await tx.objectStore(PHOTO_STORE).put(metadata);
  await tx.objectStore(BLOB_STORE).put(blob, id);
  await tx.done;

  await pruneStorage();
};

export const listPendingPhotos = async (): Promise<OfflinePhotoMeta[]> => {
  const db = await getDb();
  const items = await db.getAll(PHOTO_STORE);
  return items
    .filter((item) => !item.uploaded)
    .sort((a, b) => a.createdAt - b.createdAt);
};

export const getPhotoBlob = async (id: string) => {
  const db = await getDb();
  return db.get(BLOB_STORE, id);
};

export const markUploaded = async (id: string, remotePath: string) => {
  const db = await getDb();
  const item = await db.get(PHOTO_STORE, id);
  if (!item) return;

  const updated: OfflinePhotoMeta = {
    ...item,
    uploaded: true,
    remotePath,
  };

  await db.put(PHOTO_STORE, updated);
};

export const removePhotoBlob = async (id: string) => {
  const db = await getDb();
  await db.delete(BLOB_STORE, id);
};

export const rebindOfflinePhotos = async (
  oldAppointmentId: string,
  newAppointmentId: string
) => {
  const db = await getDb();
  const items = await db.getAll(PHOTO_STORE);
  const toUpdate = items.filter(
    (item) =>
      item.entityRef === oldAppointmentId || item.apontamentoId === oldAppointmentId
  );
  if (!toUpdate.length) return;

  const tx = db.transaction(PHOTO_STORE, "readwrite");
  for (const item of toUpdate) {
    await tx.store.put({
      ...item,
      entityRef: newAppointmentId,
      apontamentoId: newAppointmentId,
    });
  }
  await tx.done;
};

export const pruneStorage = async (params?: {
  maxItems?: number;
  maxBytes?: number;
}) => {
  const maxItems = params?.maxItems ?? 20;
  const maxBytes = params?.maxBytes ?? 50 * 1024 * 1024;

  const db = await getDb();
  const items = await db.getAll(PHOTO_STORE);

  let totalBytes = items.reduce((sum, item) => sum + (item.size || 0), 0);
  let totalItems = items.length;

  if (totalItems <= maxItems && totalBytes <= maxBytes) {
    return;
  }

  const uploaded = items
    .filter((item) => item.uploaded)
    .sort((a, b) => a.createdAt - b.createdAt);
  const pending = items
    .filter((item) => !item.uploaded)
    .sort((a, b) => a.createdAt - b.createdAt);

  const removals = [...uploaded, ...pending];
  const tx = db.transaction([PHOTO_STORE, BLOB_STORE], "readwrite");

  for (const item of removals) {
    if (totalItems <= maxItems && totalBytes <= maxBytes) break;
    await tx.objectStore(PHOTO_STORE).delete(item.id);
    await tx.objectStore(BLOB_STORE).delete(item.id);
    totalItems -= 1;
    totalBytes -= item.size || 0;
  }

  await tx.done;

  if (totalItems > maxItems || totalBytes > maxBytes) {
    console.warn(
      "Armazenamento offline excedeu o limite mesmo apos a limpeza.",
      { totalItems, totalBytes, maxItems, maxBytes }
    );
  }
};
