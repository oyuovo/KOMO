'use client';

import { useCallback, useEffect, useRef } from 'react';

/** 只允许当前范围中最后一次请求提交结果；旧回调也不能使新请求失效。 */
export function useLatestRequest(scope: string) {
  const state = useRef({ scope, version: 0, mounted: true });
  if (state.current.scope !== scope) {
    state.current.scope = scope;
    state.current.version++;
  }
  useEffect(() => {
    state.current.mounted = true;
    return () => { state.current.mounted = false; state.current.version++; };
  }, []);
  return useCallback(() => {
    if (state.current.scope !== scope || !state.current.mounted) return () => false;
    const version = ++state.current.version;
    return () => state.current.mounted && state.current.scope === scope && state.current.version === version;
  }, [scope]);
}
