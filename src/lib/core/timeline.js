// Period slider with play/pause, jump to the first / last period and step back / forward.
// Hidden when the data has a single period.
import { h } from './dom.js';

export function createTimeline(container, ctx) {
  const { periods } = ctx.data;
  if (periods.length < 2) {
    container.hidden = true;
    return { update() {}, stop() {} };
  }
  const interval = ctx.config.options?.interval ?? 1300;
  let timer = 0;

  const playBtn = h('button', { type: 'button', class: 'tl-play', id: 'ua-tl-play' });
  const icon = (d) => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>`;
  const firstBtn = h('button', { type: 'button', class: 'tl-step', id: 'ua-tl-first', html: icon('M3 3.2h1.6v9.6H3zM13 3.6v8.8a.5.5 0 0 1-.8.4L6.1 8.4a.5.5 0 0 1 0-.8l6.1-4.4a.5.5 0 0 1 .8.4z') });
  const prevBtn = h('button', { type: 'button', class: 'tl-step', id: 'ua-tl-prev', text: '‹' });
  const nextBtn = h('button', { type: 'button', class: 'tl-step', id: 'ua-tl-next', text: '›' });
  const lastBtn = h('button', { type: 'button', class: 'tl-step', id: 'ua-tl-last', html: icon('M13 3.2h-1.6v9.6H13zM3 3.6v8.8a.5.5 0 0 0 .8.4l6.1-4.4a.5.5 0 0 0 0-.8L3.8 3.2a.5.5 0 0 0-.8.4z') });
  const range = h('input', { type: 'range', min: 0, max: periods.length - 1, step: 1, id: 'ua-tl-range', class: 'tl-range' });
  const label = h('output', { class: 'tl-label', for: 'ua-tl-range' });
  const ends = h('div', { class: 'tl-ends', 'aria-hidden': 'true' }, h('span', {}, ctx.periodLabel(0)), h('span', {}, ctx.periodLabel(periods.length - 1)));
  container.append(h('div', { class: 'tl-row' }, playBtn, firstBtn, prevBtn, nextBtn, lastBtn, h('div', { class: 'tl-track' }, range, ends), label));

  const go = (p) => ctx.state.set({ period: Math.max(0, Math.min(periods.length - 1, p)) });
  const stop = () => {
    clearInterval(timer);
    timer = 0;
    ctx.state.set({ playing: false });
  };
  const play = () => {
    if (ctx.state.get().period >= periods.length - 1) go(0);
    ctx.state.set({ playing: true });
    timer = setInterval(() => {
      const p = ctx.state.get().period;
      if (p >= periods.length - 1) stop();
      else go(p + 1);
    }, interval);
  };
  playBtn.addEventListener('click', () => (timer ? stop() : play()));
  prevBtn.addEventListener('click', () => {
    stop();
    go(ctx.state.get().period - 1);
  });
  nextBtn.addEventListener('click', () => {
    stop();
    go(ctx.state.get().period + 1);
  });
  firstBtn.addEventListener('click', () => {
    stop();
    go(0);
  });
  lastBtn.addEventListener('click', () => {
    stop();
    go(periods.length - 1);
  });
  range.addEventListener('input', () => {
    stop();
    go(+range.value);
  });

  function update() {
    const st = ctx.state.get();
    range.value = st.period;
    range.setAttribute('aria-valuetext', ctx.periodLabel(st.period));
    label.textContent = ctx.periodLabel(st.period);
    const t = ctx.t;
    playBtn.setAttribute('aria-label', st.playing ? t('pause') : t('play'));
    playBtn.dataset.state = st.playing ? 'playing' : 'paused';
    playBtn.innerHTML = st.playing
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3" width="3" height="10" rx="1"/><rect x="9.5" y="3" width="3" height="10" rx="1"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z"/></svg>';
    prevBtn.setAttribute('aria-label', t('prev'));
    nextBtn.setAttribute('aria-label', t('next'));
    firstBtn.setAttribute('aria-label', t('first'));
    lastBtn.setAttribute('aria-label', t('last'));
    firstBtn.title = t('first');
    lastBtn.title = t('last');
    range.setAttribute('aria-label', t('timeline'));
    prevBtn.disabled = firstBtn.disabled = st.period <= 0;
    nextBtn.disabled = lastBtn.disabled = st.period >= periods.length - 1;
    ends.children[0].textContent = ctx.periodLabel(0);
    ends.children[1].textContent = ctx.periodLabel(periods.length - 1);
  }
  update();
  return { update, stop };
}
