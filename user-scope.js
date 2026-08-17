// NAYAD per-user local data isolation.
// Keeps Supabase auth storage untouched and scopes only NAYAD_DATA_V2.
(function () {
  const KEY = "NAYAD_DATA_V2";
  const OWNER_KEY = "NAYAD_DATA_V2_MIGRATED_OWNER";
  const EMPTY_DATA = JSON.stringify({ companies: [], payments: [] });
  const rawGet = Storage.prototype.getItem;
  const rawSet = Storage.prototype.setItem;
  const rawRemove = Storage.prototype.removeItem;
  let activeUserId = null;
  let initialized = false;
  let reloadScheduled = false;

  function scopedKey() {
    return activeUserId ? KEY + "_USER_" + activeUserId : KEY;
  }

  function findStoredAuthUserId() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        if (!k.startsWith("sb-") || !k.endsWith("-auth-token")) continue;
        const raw = rawGet.call(localStorage, k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const user = parsed?.user || parsed?.currentSession?.user;
        if (user?.id) return user.id;
      }
    } catch (_) {}
    return null;
  }

  function migrateLegacyIfNeeded(userId) {
    if (!userId) return;
    try {
      if (rawGet.call(localStorage, KEY + "_USER_" + userId)) return;
      if (rawGet.call(localStorage, OWNER_KEY)) return;
      const legacy = rawGet.call(localStorage, KEY);
      if (!legacy) return;
      rawSet.call(localStorage, KEY + "_USER_" + userId, legacy);
      rawSet.call(localStorage, OWNER_KEY, userId);
    } catch (_) {}
  }

  activeUserId = findStoredAuthUserId();
  migrateLegacyIfNeeded(activeUserId);

  Storage.prototype.getItem = function (key) {
    if (key === KEY && activeUserId) {
      const scoped = rawGet.call(this, scopedKey());
      return scoped || EMPTY_DATA;
    }
    return rawGet.call(this, key);
  };

  Storage.prototype.setItem = function (key, value) {
    if (key === KEY && activeUserId) return rawSet.call(this, scopedKey(), value);
    return rawSet.call(this, key, value);
  };

  Storage.prototype.removeItem = function (key) {
    if (key === KEY && activeUserId) return rawRemove.call(this, scopedKey());
    return rawRemove.call(this, key);
  };

  Object.defineProperty(window, "__nayadUser", {
    configurable: true,
    get() { return window.__nayadUserValue || null; },
    set(user) {
      const nextId = user?.id || null;
      const changed = !!nextId && activeUserId !== nextId;
      window.__nayadUserValue = user || null;
      if (nextId) {
        migrateLegacyIfNeeded(nextId);
        activeUserId = nextId;
      } else {
        activeUserId = null;
      }
      if (changed && initialized && !reloadScheduled) {
        reloadScheduled = true;
        setTimeout(() => location.reload(), 0);
      }
    }
  });

  initialized = true;
  window.nayadUserScope = {
    getUserId: () => activeUserId,
    getDataKey: () => activeUserId ? scopedKey() : KEY
  };
})();
