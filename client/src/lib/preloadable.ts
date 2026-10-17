/**
 * A lazily loaded component that never waits on a Suspense boundary.
 *
 * Measured 2026-10-15 (references/stress-results.md): every app open waited
 * ~300 ms doing nothing. React 19 reveals a Suspense boundary's content in
 * ~300 ms batches (its fallback throttle), and the shell was `lazy()` behind
 * one, so the Dashboard's data request left at ~368 ms instead of ~80 ms.
 *
 * `preloadable(load, Fallback)` gives a component plus `preload()`. If the
 * module is already here — preloaded early, or loaded by an earlier render —
 * it renders the module directly. If not, it renders `Fallback`, asks for
 * the module, and swaps it in with an ordinary state update the moment it
 * arrives. No Suspense is involved, so there is nothing to throttle — which
 * is what makes the FIRST visit fast too, when nothing could be preloaded.
 *
 * A failed load is thrown from render, so it reaches the error boundary as a
 * `lazy()` failure did; `reloadingImport` (@/lib/lazyPage) has already
 * reloaded the tab once if the cause was a deploy replacing the file.
 *
 * A `.ts` file, with `createElement`: the component is made once per module
 * by this factory, at load time, never inside a render.
 */
import {
  createElement,
  useEffect,
  useState,
  type ComponentType,
  type FunctionComponent,
} from "react";

type Module<P> = { default: ComponentType<P> };

export type Preloadable<P> = FunctionComponent<P> & {
  /** Start loading now; resolves when the module is here. Safe to repeat. */
  preload: () => Promise<Module<P>>;
  /**
   * Fetch ahead in the background, nobody waiting: through `load.quiet`
   * when the loader has one (@/lib/lazyPage `reloadingImport`), so a failure
   * here never reloads the tab — it is forgotten, and the page's own render
   * asks again (and may reload) only if somebody opens it.
   */
  prefetch: () => Promise<void>;
};

export function preloadable<P extends object>(
  load: (() => Promise<Module<P>>) & { quiet?: () => Promise<Module<P>> },
  Fallback: ComponentType = () => null
): Preloadable<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<Module<P>> | null = null;
  // A failed load is forgotten, so the next ask tries again: an early
  // preload that met a network blip must not become the render's answer.
  const preload = () =>
    (pending ??= load().then(
      mod => {
        loaded = mod.default;
        return mod;
      },
      err => {
        pending = null;
        throw err;
      }
    ));
  const Component: FunctionComponent<P> = props => {
    // `() => loaded`: a component is a function, so it must not be passed
    // to useState bare — React would call it as an initialiser.
    const [Page, setPage] = useState<ComponentType<P> | null>(() => loaded);
    const [failure, setFailure] = useState<unknown>(null);
    useEffect(() => {
      if (Page) return;
      let live = true;
      preload().then(
        mod => live && setPage(() => mod.default),
        err => live && setFailure(() => err ?? new Error("load failed"))
      );
      return () => {
        live = false;
      };
    }, [Page]);
    if (failure) throw failure;
    return Page ? createElement(Page, props) : createElement(Fallback);
  };
  const prefetch = (): Promise<void> => {
    if (loaded || pending) return Promise.resolve();
    return (load.quiet ?? load)().then(
      mod => {
        loaded ??= mod.default;
      },
      () => {}
    );
  };
  return Object.assign(Component, { preload, prefetch });
}
