// fsrs.js: FSRS-6 scheduler, pure functions only (no store, no DOM).
// Default parameters from open-spaced-repetition/py-fsrs. The maths is
// unchanged from the single-file app; tools/test.js checks that.
(function (root) {
  'use strict';
  const F = root.F = root.F || {};

  const W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
             0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
             0.0912, 0.0658, 0.1542];
  const DECAY = -W[20];
  const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
  const DESIRED_RETENTION = 0.9;   // 90%, the standard target; higher means more reviews
  const LEARN_STEPS = [1, 10];     // minutes, same-day steps for a brand new card
  const RELEARN_STEPS = [10];      // minutes, after a lapse
  const MAX_INTERVAL = 36500;      // days
  const MIN_MS = 60000;
  const DAY_MS = 86400000;
  const MATURE_DAYS = 21;          // a card counts as "mastered" once it survives 3 weeks
  const SITTING_MS = 20 * MIN_MS;  // cards due sooner than this come back in this session

  const clampD = d => Math.min(Math.max(d, 1), 10);
  const clampS = s => Math.max(s, 0.001);

  function retrievability(s, elapsedDays) {
    return Math.pow(1 + FACTOR * elapsedDays / s, DECAY);
  }
  function initDifficulty(g) { return W[4] - Math.exp(W[5] * (g - 1)) + 1; }
  function nextDifficulty(d, g) {
    const delta = -(W[6] * (g - 3));
    const damped = d + (10 - d) * delta / 9;
    return clampD(W[7] * initDifficulty(4) + (1 - W[7]) * damped);
  }
  function shortTermStability(s, g) {
    let inc = Math.exp(W[17] * (g - 3 + W[18])) * Math.pow(s, -W[19]);
    if (g >= 2) inc = Math.max(inc, 1);
    return clampS(s * inc);
  }
  function recallStability(d, s, r, g) {
    const hard = g === 2 ? W[15] : 1;
    const easy = g === 4 ? W[16] : 1;
    return clampS(s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9])
      * (Math.exp((1 - r) * W[10]) - 1) * hard * easy));
  }
  function forgetStability(d, s, r) {
    const long = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1)
      * Math.exp((1 - r) * W[14]);
    const short = s / Math.exp(W[17] * W[18]);
    return clampS(Math.min(long, short));
  }
  function interval(s) {
    const days = (s / FACTOR) * (Math.pow(DESIRED_RETENTION, 1 / DECAY) - 1);
    return Math.min(Math.max(Math.round(days), 1), MAX_INTERVAL);
  }
  // Spreads same-day piles apart so reviews don't clump on one date
  function fuzzInterval(days) {
    if (days < 2.5) return days;
    let delta = 1;
    delta += 0.15 * Math.max(Math.min(days, 7) - 2.5, 0);
    delta += 0.10 * Math.max(Math.min(days, 20) - 7, 0);
    delta += 0.05 * Math.max(days - 20, 0);
    const lo = Math.max(2, Math.round(days - delta));
    const hi = Math.min(MAX_INTERVAL, Math.max(lo, Math.round(days + delta)));
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }

  // Grades: 1 again, 2 hard, 3 good, 4 easy. Returns the new memory state
  // {d, s, due, last, state, step, reps, lapses} without touching `prev`.
  function review(prev, g, now, noFuzz) {
    const st = prev
      ? { d: prev.d, s: prev.s, due: prev.due, last: prev.last, state: prev.state, step: prev.step || 0, reps: prev.reps || 0, lapses: prev.lapses || 0 }
      : { d: 0, s: 0, due: now, last: now, state: 'learning', step: 0, reps: 0, lapses: 0 };
    const graduate = () => {
      const days = interval(st.s);
      return (noFuzz ? days : fuzzInterval(days)) * DAY_MS;
    };
    if (!prev) {
      st.s = clampS(W[g - 1]);
      st.d = clampD(initDifficulty(g));
    } else {
      const elapsed = Math.max(0, (now - st.last) / DAY_MS);
      if (elapsed < 1) {
        st.s = shortTermStability(st.s, g);
      } else {
        const r = retrievability(st.s, elapsed);
        st.s = g === 1 ? forgetStability(st.d, st.s, r) : recallStability(st.d, st.s, r, g);
      }
      st.d = nextDifficulty(st.d, g);
    }

    let ivl;
    if (st.state === 'review') {
      if (g === 1) { st.lapses++; st.state = 'relearning'; st.step = 0; ivl = RELEARN_STEPS[0] * MIN_MS; }
      else ivl = graduate();
    } else {
      const steps = st.state === 'relearning' ? RELEARN_STEPS : LEARN_STEPS;
      if (g === 1) { st.step = 0; ivl = steps[0] * MIN_MS; }
      else if (g === 2) {
        const next = st.step + 1 < steps.length ? (steps[st.step] + steps[st.step + 1]) / 2 : steps[st.step] * 1.5;
        ivl = next * MIN_MS;
      } else if (g === 3) {
        st.step++;
        if (st.step >= steps.length) { st.state = 'review'; st.step = 0; ivl = graduate(); }
        else ivl = steps[st.step] * MIN_MS;
      } else {
        st.state = 'review'; st.step = 0; ivl = graduate();
      }
    }
    st.reps++;
    st.last = now;
    st.due = now + ivl;
    return st;
  }

  function fmtIvl(ms) {
    const mins = ms / MIN_MS;
    if (mins < 60) return Math.max(1, Math.round(mins)) + 'm';
    const hours = mins / 60;
    if (hours < 24) return Math.round(hours) + 'h';
    const days = hours / 24;
    if (days < 30) return Math.round(days) + 'd';
    const months = days / 30.44;
    if (months < 12) return (months < 2 ? months.toFixed(1) : Math.round(months)) + 'mo';
    return (days / 365.25).toFixed(1) + 'y';
  }

  F.fsrs = {
    W, DECAY, FACTOR, DESIRED_RETENTION, LEARN_STEPS, RELEARN_STEPS, MAX_INTERVAL,
    MIN_MS, DAY_MS, MATURE_DAYS, SITTING_MS,
    clampD, clampS, retrievability, initDifficulty, nextDifficulty, shortTermStability,
    recallStability, forgetStability, interval, fuzzInterval, review, fmtIvl,
  };
})(typeof window !== 'undefined' ? window : globalThis);
