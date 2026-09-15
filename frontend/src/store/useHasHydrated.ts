import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

export function useHasHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
