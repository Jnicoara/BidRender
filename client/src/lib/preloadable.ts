/**
 * A lazily loaded component that STOPS being lazy once its code is here.
 *
 * Measured 2026-10-15 (references/stress-results.md): every app open waited
 * ~300 ms doing nothing. React 19 reveals a Suspense boundary's content in
 * ~300 ms batches (its fallback throttle), and the shell was `lazy()` behind
 * one, so the first data request left at ~360 ms instead of ~50 ms — the
 * floor under every screen's time.
 *
 * `preloadable(load)` gives a component plus `preload()`. Before the module
 * has arrived it renders through `lazy()` (Suspense, as before); once it has
 * — preloaded early, or by an earlier render — new mounts render the module
 * DIRECTLY, with no boundary to throttle. An instance keeps the path it
 * mounted on (`useRef`), so a page never remounts, and loses what was typed
 * into it, at the moment its code finishes loading.
 *
 * A `.ts` file, with `createElement`: the component is made once per module
 * by this factory, at load time, never inside a render.
 */
import {
  createElement,
  lazy,
  useRef,
  type ComponentType,
  type FunctionComponent,
} from "react";

type Module<P> = { default: ComponentType<P> };

export type Preloadable<P> = FunctionComponent<P> & {
  /** Start loading now; resolves when the module is here. Safe to repeat. */
  preload: () => Promise<Module<P>>;
};

export function preloadable<P extends object>(
  load: () => Promise<Module<P>>
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
  const Lazy = lazy(preload);
  const Component: FunctionComponent<P> = props => {
    // Decided once per mounted instance — see the header.
    const direct = useRef(loaded).current;
    return direct
      ? createElement(direct, props)
      : createElement(Lazy as unknown as ComponentType<P>, props);
  };
  return Object.assign(Component, { preload });
}
