import {
  type ContextProvider,
  type ContextProviderProps,
  createContextProvider,
} from '@solid-primitives/context';

/**
 * Creates a context provider that throws if used outside of provider tree.
 * Thin wrapper around solid-primitives createContextProvider.
 *
 * @param name - Name of the context (used in error messages)
 * @param factory - Factory function that creates the context value
 * @returns Tuple of [Provider, useContext, useOptionalContext]. useContext throws
 * if undefined; useOptionalContext returns undefined outside the provider.
 */
export function createAssertedContextProvider<
  T,
  P extends ContextProviderProps = ContextProviderProps,
>(
  name: string,
  factory: (props: P) => T
): [
  provider: ContextProvider<P>,
  useContext: () => T,
  useOptionalContext: () => T | undefined,
] {
  const [Provider, useContext] = createContextProvider(factory);
  const useAssertedContext = (): T => {
    const ctx = useContext();
    if (ctx === undefined) {
      throw new Error(`${name} must be used within <${name}Provider />`);
    }
    return ctx;
  };
  return [Provider, useAssertedContext, useContext];
}
