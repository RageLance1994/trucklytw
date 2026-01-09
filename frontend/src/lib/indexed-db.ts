const DEFAULT_DB_NAME = "truckly-cache";
const DEFAULT_VERSION = 1;

const MIN_TIMESTAMP = -Infinity;
const MAX_TIMESTAMP = Infinity;
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

const isFiniteNumber = (value: unknown): value is number => Number.isFinite(value);

const toMs = (value: number) => (value < 10_000_000_000 ? value * 1000 : value);

const normaliseBound = (value: unknown, fallback: number) => {
  if (value == null) return fallback;
  if (value instanceof Date) {
    const ms = value.getTime();
    return isFiniteNumber(ms) ? ms : fallback;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (isFiniteNumber(numeric)) return numeric;
    const parsed = Date.parse(value);
    if (isFiniteNumber(parsed)) return parsed;
  }
  if (typeof value === "number") {
    return isFiniteNumber(value) ? value : fallback;
  }
  return fallback;
};

const resolveTimestampMs = (record: any) => {
  if (!record || typeof record !== "object") return null;

  if (isFiniteNumber(record.timestamp)) {
    return toMs(record.timestamp);
  }
  if (isFiniteNumber(record.ts)) {
    return toMs(record.ts);
  }

  const ts = record?.timestamp?.$date || record?.timestamp;
  if (typeof ts === "string") {
    const parsed = Date.parse(ts);
    if (isFiniteNumber(parsed)) return parsed;
    const numeric = Number(ts);
    if (isFiniteNumber(numeric)) return toMs(numeric);
  }
  if (record.timestamp instanceof Date) {
    const parsed = record.timestamp.getTime();
    if (isFiniteNumber(parsed)) return parsed;
  }

  const ioTs = record?.io?.timestamp;
  if (isFiniteNumber(ioTs)) {
    return toMs(ioTs);
  }

  const oid = record?._id?.$oid || record?._id || null;
  if (typeof oid === "string" && OBJECT_ID_REGEX.test(oid)) {
    const seconds = parseInt(oid.slice(0, 8), 16);
    if (isFiniteNumber(seconds)) return seconds * 1000;
  }

  return null;
};

const waitForTx = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new DOMException("Transaction aborted.", "AbortError"));
  });

const reqToPromise = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const defaultFilter = (filters: Record<string, any> = {}) => (record: any) => {
  if (!filters || typeof filters !== "object") return true;
  return Object.entries(filters).every(([key, value]) => record?.[key] === value);
};

const closeQuietly = (db: IDBDatabase | null, context?: string) => {
  try {
    if (db) db.close();
  } catch (err) {
    console.warn("[IndexedDB]", context || "close", err);
  }
};

export class TrucklyIndexedDb {
  dbName: string;
  version: number;
  db: IDBDatabase | null;

  constructor(options: { dbName?: string; version?: number } = {}) {
    this.dbName = options.dbName || DEFAULT_DB_NAME;
    this.version = options.version || DEFAULT_VERSION;
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;

    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName);
      request.onupgradeneeded = () => {
        const db = request.result;
        this.version = db.version;
      };
      request.onsuccess = () => {
        const db = request.result;
        this.version = db.version;
        db.onversionchange = () => {
          closeQuietly(db, "versionchange");
          if (this.db === db) {
            this.db = null;
          }
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });

    return this.db;
  }

  async ensureStore(storeName: string) {
    if (!storeName) throw new Error("storeName is required");
    const db = await this.open();

    let needsUpgrade = false;

    if (!db.objectStoreNames.contains(storeName)) {
      needsUpgrade = true;
    } else {
      try {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        if (!store.indexNames.contains("by_timestamp")) {
          needsUpgrade = true;
        }
        tx.abort();
      } catch {
        needsUpgrade = true;
      }
    }

    if (!needsUpgrade) return storeName;

    closeQuietly(db, "ensureStore");
    if (this.db === db) this.db = null;

    const newVersion = this.version + 1;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, newVersion);
      request.onupgradeneeded = () => {
        const upgradeDb = request.result;
        let store: IDBObjectStore;
        if (!upgradeDb.objectStoreNames.contains(storeName)) {
          store = upgradeDb.createObjectStore(storeName, { keyPath: "timestamp" });
        } else {
          store = request.transaction?.objectStore(storeName) as IDBObjectStore;
        }
        if (!store.indexNames.contains("by_timestamp")) {
          store.createIndex("by_timestamp", "timestamp", { unique: true });
        }
      };
      request.onsuccess = () => {
        const upgraded = request.result;
        upgraded.onversionchange = () => {
          closeQuietly(upgraded, "versionchange");
          if (this.db === upgraded) this.db = null;
        };
        this.db = upgraded;
        this.version = newVersion;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    return storeName;
  }

  async get(
    storeName: string,
    from?: number | Date | string | null,
    to?: number | Date | string | null,
    filters: Record<string, any> = {},
    options: { direction?: "prev" | "next"; limit?: number } = {},
  ) {
    if (!storeName) throw new Error("storeName is required");
    const db = await this.open();

    if (!db.objectStoreNames.contains(storeName)) {
      return [];
    }

    const lower = normaliseBound(from, MIN_TIMESTAMP);
    const upper = normaliseBound(to, MAX_TIMESTAMP);
    const range = IDBKeyRange.bound(lower, upper);
    const predicate = defaultFilter(filters);
    const results: any[] = [];
    const direction = options.direction === "prev" ? "prev" : "next";
    const limit = Number.isFinite(options.limit) ? Math.max(0, options.limit as number) : null;

    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);

    const source = store.indexNames.contains("by_timestamp")
      ? store.index("by_timestamp")
      : store;

    await new Promise<void>((resolve, reject) => {
      const request = source.openCursor(range, direction);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve();

        const value = cursor.value;
        if (predicate(value)) {
          results.push(value);
        }
        if (limit && results.length >= limit) {
          return resolve();
        }
        cursor.continue();
      };
    });

    await waitForTx(tx);
    return results;
  }

  async addMany(
    storeName: string,
    records: any[],
    options: { onDuplicate?: "update" | "skip" } = {},
  ) {
    if (!storeName) throw new Error("storeName is required");
    if (!Array.isArray(records)) throw new Error("records must be an array");

    const { onDuplicate = "update" } = options;
    await this.ensureStore(storeName);

    const db = await this.open();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);

    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        const timestamp = resolveTimestampMs(record);
        if (!isFiniteNumber(timestamp)) throw new Error("timestamp missing");

        const payload = { ...record, timestamp: Number(timestamp) };

        if (onDuplicate === "skip") {
          try {
            await reqToPromise(store.add(payload));
            inserted++;
          } catch (err: any) {
            if (err?.name === "ConstraintError") {
              continue;
            }
            throw err;
          }
        } else {
          await reqToPromise(store.put(payload));
          inserted++;
        }
      } catch (err: any) {
        errors.push(String(err?.message || err));
      }
    }

    await waitForTx(tx);
    return { inserted, updated, errors };
  }
}
