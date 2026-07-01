import type { CpiData } from "./cpi";
import { type Store, loadStoreFrom } from "./profiles";

const V2_KEY = "kaupmattur-launa:v2";
const V1_KEY = "kaupmattur-launa:v1";

/**
 * Load the profile store. Precedence: valid v2 > migrate valid v1 > fresh.
 * After a successful v1 migration the old v1 key is removed so a stale old
 * bundle can't write a divergent copy that v2 would silently ignore.
 */
export function loadStore(cpi: CpiData): Store {
  let v2raw: string | null = null;
  let v1raw: string | null = null;
  try {
    v2raw = localStorage.getItem(V2_KEY);
    v1raw = localStorage.getItem(V1_KEY);
  } catch {
    /* storage blocked — fall through to fresh */
  }
  const { store, migrated } = loadStoreFrom(v2raw, v1raw, cpi);
  if (migrated) {
    try {
      localStorage.setItem(V2_KEY, JSON.stringify(store));
      localStorage.removeItem(V1_KEY);
    } catch {
      /* ignore */
    }
  }
  return store;
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(V2_KEY, JSON.stringify(store));
  } catch {
    /* storage may be full or blocked; the app simply won't persist */
  }
}
