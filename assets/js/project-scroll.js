(() => {
  const covers = [...document.querySelectorAll('[data-scroll-frame-count]')];
  if (!covers.length || !('IntersectionObserver' in window)) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const states = covers.map(cover => ({cover, frames: [], visible: false, index: -1}));
  let scheduled = 0;

  function render() {
    scheduled = 0;
    if (document.hidden) return;
    states.forEach(state => {
      const {cover, frames} = state;
      if (!state.visible || reducedMotion.matches || !frames.length) return;
      const rect = cover.getBoundingClientRect();
      // The exported 24-frame sequence already goes 88 -> 95 -> 88.
      // One cycle per 280px; reversing the scroll reverses the frames.
      const travel = Math.max(0, window.innerHeight - rect.top);
      const index = Math.floor(travel / 280 * frames.length) % frames.length;
      const frame = frames[index];
      if (index !== state.index && frame.complete && frame.naturalWidth) {
        cover.src = frame.src;
        state.index = index;
      }
    });
  }

  function schedule() {
    if (!scheduled) scheduled = requestAnimationFrame(render);
  }

  function preload(state) {
    if (state.frames.length || reducedMotion.matches) return;
    state.frames = Array.from({length: Number(state.cover.dataset.scrollFrameCount)}, (_, i) => {
      const frame = new Image();
      frame.onload = schedule;
      frame.src = `${state.cover.dataset.scrollFramePrefix}${String(i + 1).padStart(2, '0')}.webp`;
      return frame;
    });
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const state = states.find(item => item.cover === entry.target);
      state.visible = entry.isIntersecting;
      if (state.visible) preload(state);
    });
    schedule();
  }, {rootMargin: '160px 0px'});

  states.forEach(state => observer.observe(state.cover));
  window.addEventListener('scroll', schedule, {passive: true});
  window.addEventListener('resize', schedule, {passive: true});
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', () => {
    states.forEach(state => {
      if (reducedMotion.matches) {
        state.cover.src = `${state.cover.dataset.scrollFramePrefix}01.webp`;
        state.index = -1;
      } else if (state.visible) preload(state);
    });
    schedule();
  });
})();
