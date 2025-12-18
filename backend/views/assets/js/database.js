const DEFAULT_DB_NAME = 'truckly-cache';
const DEFAULT_VERSION = 1;

const MIN_TIMESTAMP = -Infinity;
const MAX_TIMESTAMP = Infinity;
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

const isFiniteNumber = (value) => Number.isFinite(value);

const toMs = (value) => {
    if (!isFiniteNumber(value)) return null;
    return value < 10_000_000_000 ? value * 1000 : value;
};

const normaliseBound = (value, fallback) => {
    if (value == null) return fallback;
    if (value instanceof Date) {
        const ms = value.getTime();
        return isFiniteNumber(ms) ? ms : fallback;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const numeric = Number(value);
        if (isFiniteNumber(numeric)) return numeric;
        const parsed = Date.parse(value);
        if (isFiniteNumber(parsed)) return parsed;
    }
    if (typeof value === 'number') {
        return isFiniteNumber(value) ? value : fallback;
    }
    return fallback;
};

const resolveTimestampMs = (record) => {
    if (!record || typeof record !== 'object') return null;

    if (isFiniteNumber(record.timestamp)) {
        return toMs(record.timestamp);
    }

    if (isFiniteNumber(record.ts)) {
        return toMs(record.ts);
    }

    const ts = record?.timestamp?.$date || record?.timestamp;
    if (typeof ts === 'string') {
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
    if (typeof oid === 'string' && OBJECT_ID_REGEX.test(oid)) {
        const seconds = parseInt(oid.slice(0, 8), 16);
        if (isFiniteNumber(seconds)) return seconds * 1000;
    }

    return null;
};

const waitForTx = (tx) => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new DOMException('Transaction aborted.', 'AbortError'));
});

const reqToPromise = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
});

const defaultFilter = (filters = {}) => (record) => {
    if (!filters || typeof filters !== 'object') return true;
    return Object.entries(filters).every(([key, value]) => record?.[key] === value);
};

const closeQuietly = (db, context) => {
    try {
        if (db) db.close();
    } catch (err) {
        console.warn('[IndexedDB]', context || 'close', err);
    }
};

export class TeltonikaIndexedDb {
    constructor(options = {}) {
        this.dbName = options.dbName || DEFAULT_DB_NAME;
        this.version = options.version || DEFAULT_VERSION;
        this.db = null;
    }

    async open() {
        if (this.db) return this.db;

        this.db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName);
            request.onupgradeneeded = () => {
                const db = request.result;
                this.version = db.version;
            };
            request.onsuccess = () => {
                const db = request.result;
                this.version = db.version;
                db.onversionchange = () => {
                    closeQuietly(db, 'versionchange');
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

    async ensureStore(storeName) {
        if (!storeName) throw new Error('storeName is required');
        const db = await this.open();

        let needsUpgrade = false;

        if (!db.objectStoreNames.contains(storeName)) {
            needsUpgrade = true;
        } else {
            try {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                if (!store.indexNames.contains('by_timestamp')) {
                    needsUpgrade = true;
                }
                tx.abort();
            } catch {
                needsUpgrade = true;
            }
        }

        if (!needsUpgrade) return storeName;

        closeQuietly(db, 'ensureStore');
        if (this.db === db) this.db = null;

        const newVersion = this.version + 1;
        await new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, newVersion);
            request.onupgradeneeded = () => {
                const upgradeDb = request.result;
                let store;
                if (!upgradeDb.objectStoreNames.contains(storeName)) {
                    store = upgradeDb.createObjectStore(storeName, { keyPath: 'timestamp' });
                } else {
                    store = request.transaction.objectStore(storeName);
                }
                if (!store.indexNames.contains('by_timestamp')) {
                    store.createIndex('by_timestamp', 'timestamp', { unique: true });
                }
            };
            request.onsuccess = () => {
                const upgraded = request.result;
                upgraded.onversionchange = () => {
                    closeQuietly(upgraded, 'versionchange');
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

    async get(storeName, from, to, filters = {}, options = {}) {
        if (!storeName) throw new Error('storeName is required');
        const db = await this.open();

        if (!db.objectStoreNames.contains(storeName)) {
            return [];
        }

        const lower = normaliseBound(from, MIN_TIMESTAMP);
        const upper = normaliseBound(to, MAX_TIMESTAMP);
        const range = IDBKeyRange.bound(lower, upper);
        const predicate = defaultFilter(filters);
        const results = [];
        const direction = options.direction === 'prev' ? 'prev' : 'next';
        const limit = Number.isFinite(options.limit) ? Math.max(0, options.limit) : null;

        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);

        const source = store.indexNames.contains('by_timestamp')
            ? store.index('by_timestamp')
            : store;

        await new Promise((resolve, reject) => {
            const request = source.openCursor(range, direction);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return resolve();

                const value = cursor.value;
                if (predicate(value)) {
                    results.push(value);
                }
                // stop early if we hit limit
                if (limit && results.length >= limit) {
                    return resolve();
                }
                cursor.continue();
            };
        });

        await waitForTx(tx);
        return results;
    }

    async add(storeName, record) {
        if (!storeName) throw new Error('storeName is required');
        if (!record || typeof record !== 'object') throw new Error('record must be an object');

        const timestamp = resolveTimestampMs(record);
        if (!isFiniteNumber(timestamp)) {
            throw new Error('record timestamp is required and must be resolvable to milliseconds');
        }

        const payload = {
            ...record,
            timestamp: Number(timestamp),
        };

        await this.ensureStore(storeName);

        const db = await this.open();
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        try {
            await reqToPromise(store.add(payload));
            await waitForTx(tx);
            return payload;
        } catch (err) {
            if (err?.name === 'ConstraintError') {
                const duplicate = new Error(`duplicate timestamp "${timestamp}" in store "${storeName}"`);
                duplicate.code = 'DUPLICATE_TIMESTAMP';
                duplicate.store = storeName;
                duplicate.timestamp = timestamp;
                throw duplicate;
            }
            try { tx.abort(); } catch { /** noop */ }
            throw err;
        }
    }

    async upsert(storeName, record) {
        if (!storeName) throw new Error('storeName is required');
        if (!record || typeof record !== 'object') throw new Error('record must be an object');

        const timestamp = resolveTimestampMs(record);
        if (!isFiniteNumber(timestamp)) {
            throw new Error('record timestamp is required and must be resolvable to milliseconds');
        }

        const payload = {
            ...record,
            timestamp: Number(timestamp),
        };

        await this.ensureStore(storeName);

        const db = await this.open();
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        await reqToPromise(store.put(payload));
        await waitForTx(tx);
        return payload;
    }

    async addMany(storeName, records, options = {}) {
        if (!storeName) throw new Error('storeName is required');
        if (!Array.isArray(records)) throw new Error('records must be an array');

        const { onDuplicate = 'update' } = options; // default: upsert
        await this.ensureStore(storeName);

        const db = await this.open();
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        let inserted = 0;
        let updated = 0;
        const errors = [];

        for (const record of records) {
            try {
                const timestamp = resolveTimestampMs(record);
                if (!isFiniteNumber(timestamp)) throw new Error('timestamp missing');

                const payload = { ...record, timestamp: Number(timestamp) };

                if (onDuplicate === 'skip') {
                    // Controlla se esiste già la chiave
                    const existing = await reqToPromise(store.get(payload.timestamp));
                    if (existing) continue;
                    await reqToPromise(store.add(payload));
                    inserted++;
                } else {
                    // Upsert automatico
                    const existing = await reqToPromise(store.get(payload.timestamp));
                    if (existing) updated++;
                    await reqToPromise(store.put(payload));
                    if (!existing) inserted++;
                }
            } catch (err) {
                errors.push(String(err?.message || err));
            }
        }

        await waitForTx(tx);
        return { inserted, updated, errors };
    }


    async deleteStore(storeName) {
        if (!storeName) throw new Error('storeName is required');
        const db = await this.open();

        if (!db.objectStoreNames.contains(storeName)) return false;

        closeQuietly(db, 'deleteStore');
        if (this.db === db) this.db = null;

        const newVersion = this.version + 1;
        await new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, newVersion);
            request.onupgradeneeded = () => {
                const upgradeDb = request.result;
                if (upgradeDb.objectStoreNames.contains(storeName)) {
                    upgradeDb.deleteObjectStore(storeName);
                }
            };
            request.onsuccess = () => {
                const upgraded = request.result;
                upgraded.onversionchange = () => {
                    closeQuietly(upgraded, 'versionchange');
                    if (this.db === upgraded) this.db = null;
                };
                this.db = upgraded;
                this.version = newVersion;
                resolve();
            };
            request.onerror = () => reject(request.error);
        });

        return true;
    }

    async listStores() {
        const db = await this.open();
        return Array.from(db.objectStoreNames || []);
    }
}

export const DB = new TeltonikaIndexedDb();
