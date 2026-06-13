export interface WeighingRecord {
  id: string;
  seafoodName: string;
  timestamp: string; // YYYY-MM-DD HH:mm:ss
  kg: number | null;
  imageData: string; // base64 image data to allow offline display and syncing
  synced: boolean;
  driveUrl?: string;
  butcherName?: string;
  butcherPin?: string;
}

const DB_NAME = "ButcherSeafoodPwa_DB";
const STORE_NAME = "weighings";
const DB_VERSION = 1;

export function initIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event);
      reject("Không thể mở cơ sở dữ liệu IndexedDB");
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

// Add a fresh record
export async function saveWeighingRecord(record: WeighingRecord): Promise<void> {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      console.error("Lỗi lưu bản ghi:", event);
      reject("Không thể lưu bản ghi vào IndexedDB");
    };
  });
}

// Get all records
export async function getAllWeighingRecords(): Promise<WeighingRecord[]> {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort records from newest to oldest
      const records = request.result as WeighingRecord[];
      records.sort((a, b) => new Date(b.id).getTime() - new Date(a.id).getTime());
      resolve(records);
    };

    request.onerror = (event) => {
      console.error("Lỗi lấy danh sách bản ghi:", event);
      reject("Không thể lấy danh sách bản ghi");
    };
  });
}

// Delete a record
export async function deleteWeighingRecord(id: string): Promise<void> {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      console.error("Lỗi xóa bản ghi:", event);
      reject("Không thể xóa bản ghi");
    };
  });
}

// Mark record as synced we updated with Drive URL
export async function markRecordAsSynced(id: string, driveUrl: string): Promise<void> {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const record = getRequest.result as WeighingRecord | undefined;
      if (record) {
        record.synced = true;
        record.driveUrl = driveUrl;
        const updateRequest = store.put(record);
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = (e) => reject(e);
      } else {
        reject("Bản ghi không tồn tại");
      }
    };

    getRequest.onerror = (e) => reject(e);
  });
}
