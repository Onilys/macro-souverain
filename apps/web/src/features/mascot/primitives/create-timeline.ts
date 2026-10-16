import {
  type Accessor,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from 'solid-js';

export function createTimeline(
  duration: Accessor<number>,
  loop: Accessor<boolean>
) {
  const [time, setTime] = createSignal(0),
    [playing, setPlaying] = createSignal(false),
    [reverse, setReverse] = createSignal(false);
  createEffect(
    on(playing, (playing) => {
      if (!playing) return;
      let raf = 0,
        last = performance.now(),
        elapsed = 0,
        nextPaint = last + 1000 / 30;
      const media = matchMedia('(prefers-reduced-motion: reduce)');
      const tick = (now: number) => {
        elapsed += Math.max(0, Math.min(100, now - last));
        last = now;
        // The SDF preview is expensive. Match the prototype's 30 fps budget,
        // while accumulating elapsed time independently of the display rate.
        if (now + 0.01 < nextPaint) {
          raf = requestAnimationFrame(tick);
          return;
        }
        nextPaint +=
          (Math.floor(Math.max(0, now - nextPaint) / (1000 / 30)) + 1) *
          (1000 / 30);
        const next = time() + (elapsed / duration()) * (reverse() ? -1 : 1);
        elapsed = 0;
        if (next >= 1 || next < 0) {
          if (loop()) setTime((next + 1) % 1);
          else {
            setTime(reverse() ? 0 : 1);
            setPlaying(false);
            return;
          }
        } else setTime(next);
        raf = requestAnimationFrame(tick);
      };
      const resume = () => {
        cancelAnimationFrame(raf);
        if (!document.hidden && !media.matches) {
          last = performance.now();
          elapsed = 0;
          nextPaint = last + 1000 / 30;
          raf = requestAnimationFrame(tick);
        }
      };
      document.addEventListener('visibilitychange', resume);
      media.addEventListener('change', resume);
      resume();
      onCleanup(() => {
        cancelAnimationFrame(raf);
        document.removeEventListener('visibilitychange', resume);
        media.removeEventListener('change', resume);
      });
    })
  );
  return {
    time,
    playing,
    reverse,
    pause: () => setPlaying(false),
    seek: (value: number) => {
      setPlaying(false);
      setTime(value);
    },
    toggle: () => {
      if (
        !playing() &&
        ((time() === 1 && !reverse()) || (time() === 0 && reverse()))
      )
        setTime(reverse() ? 1 : 0);
      setPlaying(!playing());
    },
    flip: () => {
      setPlaying(false);
      setReverse(!reverse());
      setTime(reverse() ? 1 : 0);
    },
  };
}
