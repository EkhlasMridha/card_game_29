import { useSyncExternalStore } from 'react';
import { store, type ClientState } from './store';

export function useStore<T>(selector: (s: ClientState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}
