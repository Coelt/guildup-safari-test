'use strict';
(function () {
  const database = 'GuildUp.Stage01.Web.v4', store = 'saves', key = 'guild-idle-stage01-v4.json';
  let connection;
  function open() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      let request;
      try { request = indexedDB.open(database, 2); } catch (error) { reject(error); return; }
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store); };
      request.onerror = () => reject(request.error || new Error('StorageOpenError'));
      request.onblocked = () => reject(new Error('StorageBlocked'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); connection = null; };
        resolve(db);
      };
    });
    return connection;
  }
  async function load() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(store, 'readonly');
      const request = transaction.objectStore(store).get(key);
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => {
        if (result !== undefined && (typeof result.main !== 'string' || typeof result.backup !== 'string' || !Number.isInteger(result.revision) || result.revision < 1 || (result.legacyV4 !== undefined && typeof result.legacyV4 !== 'string'))) {
          reject(new Error('StorageFormatError')); return;
        }
        resolve(result || { main: '', backup: '', revision: 0 });
      };
      transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('StorageReadError'));
    });
  }
  async function save(main, backup, revision) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let transaction, conflict = false;
      try { transaction = db.transaction(store, 'readwrite', { durability: 'strict' }); }
      catch (error) {
        if (!(error instanceof TypeError)) { reject(error); return; }
        transaction = db.transaction(store, 'readwrite');
      }
      const objectStore = transaction.objectStore(store);
      const request = objectStore.get(key);
      let next;
      function schema(raw) { try { return JSON.parse(raw).Version; } catch { return 0; } }
      request.onsuccess = () => {
        const actual = request.result ? request.result.revision : 0;
        if (actual !== revision) { conflict = true; transaction.abort(); return; }
        const previous = request.result || {};
        if (schema(previous.main) === 5 && schema(main) !== 5) { conflict = true; transaction.abort(); return; }
        next = { ...previous, main, backup, revision: revision + 1 };
        if (!next.legacyV4 && schema(main) === 5) {
          const original = [previous.main, backup].find(raw => schema(raw) === 4);
          if (original) next.legacyV4 = original;
        }
        objectStore.put(next, key);
      };
      transaction.oncomplete = () => {
        window.GuildUpWeb.lastCommit = { revision: next.revision, confirmedAt: performance.now() };
        resolve(next);
      };
      transaction.onerror = transaction.onabort = () => reject(conflict ? new Error('ConcurrentTabWrite') : transaction.error || new Error('StorageWriteError'));
    });
  }
  window.GuildUpWeb = { storage: { load, save }, onVisibility: null, lastCommit: null };
  document.addEventListener('visibilitychange', () => {
    if (window.GuildUpWeb.onVisibility) window.GuildUpWeb.onVisibility(document.hidden);
  });
  window.addEventListener('pagehide', () => {
    if (window.GuildUpWeb.onVisibility) window.GuildUpWeb.onVisibility(true);
  });
  window.addEventListener('pageshow', () => {
    if (window.GuildUpWeb.onVisibility) window.GuildUpWeb.onVisibility(document.hidden);
  });
})();
