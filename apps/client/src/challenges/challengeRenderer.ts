import {
  QUIZ_BANK,
  type ActiveChallenge,
  type ChallengeSubmission,
} from '@doodle-dash/shared';
import {
  renderBossDoodleSvg,
  renderDodgeRockSvg,
  renderDoodleSvg,
  renderGiftBoxSvg,
  renderItemSvg,
  renderPatternBadge,
  renderPawnAvatarSvg,
} from './doodleIcons.js';
import type { DoodleSoundEngine } from '../audio/soundEngine.js';

export interface ChallengeRenderContext {
  challenge: ActiveChallenge;
  playerId: string;
  container: HTMLElement;
  colorblindMode: boolean;
  sound: DoodleSoundEngine;
  onSubmit: (submission: ChallengeSubmission) => void;
}

export type ChallengeRendererFn = (ctx: ChallengeRenderContext) => () => void;

function makeInputSubmission(
  playerId: string,
  claimedSuccess: boolean,
  score: number,
  startedAt: number,
  extraLog: Partial<ChallengeSubmission['inputLog']>,
): ChallengeSubmission {
  const completedAt = performance.now();
  return {
    playerId,
    claimedSuccess,
    score,
    inputLog: {
      startedAt: 0,
      completedAt: Math.max(150, Math.round(completedAt - startedAt)),
      reactionMs: Math.max(150, Math.round(completedAt - startedAt)),
      ...extraLog,
    },
  };
}

const renderTapTiming: ChallengeRendererFn = ({ challenge, playerId, container, sound, onSubmit }) => {
  const center = Number(challenge.params.zoneCenter ?? 0.5);
  const width = Number(challenge.params.zoneWidth ?? 0.22);
  const speed = Number(challenge.params.speed ?? 1.1);
  const startedAt = performance.now();
  let stopped = false;
  let needlePos = 0;

  container.innerHTML = `
    <div class="mg-wrap">
      <div class="mg-timing-track" id="mg-timing-track">
        <div class="mg-timing-zone" style="left:${(center - width / 2) * 100}%;width:${width * 100}%"></div>
        <div class="mg-timing-needle" id="mg-needle"></div>
      </div>
      <button class="doodle-btn doodle-btn-primary mg-big-btn" id="mg-tap-btn">KETUK SEKARANG!</button>
    </div>
  `;

  const track = container.querySelector<HTMLElement>('#mg-timing-track')!;
  const needle = container.querySelector<HTMLElement>('#mg-needle')!;
  const btn = container.querySelector<HTMLButtonElement>('#mg-tap-btn')!;

  let rafId = 0;
  const loop = () => {
    if (stopped) return;
    const elapsed = (performance.now() - startedAt) / 1000;
    needlePos = (Math.sin(elapsed * speed * Math.PI * 2 - Math.PI / 2) + 1) * 0.5;
    const trackW = track.clientWidth || 300;
    needle.style.transform = `translate3d(${needlePos * trackW}px, 0, 0) translateX(-50%)`;
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  btn.onclick = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKeyDown);
    sound.playUiClick();
    btn.disabled = true;
    const ok = Math.abs(needlePos - center) <= width / 2 + 0.015;
    onSubmit(makeInputSubmission(playerId, ok, ok ? 90 : 20, startedAt, { needlePos }));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      btn.click();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  return () => {
    stopped = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKeyDown);
  };
};

const renderFourOptionMcq = (
  questionHtml: string,
  options: Array<{ label: string; style?: string; badge?: string }>,
  correctIndex: number,
): ChallengeRendererFn => {
  return ({ playerId, container, sound, onSubmit }) => {
    const startedAt = performance.now();
    let done = false;
    container.innerHTML = `
      <div class="mg-wrap">
        <div class="mg-prompt">${questionHtml}</div>
        <div class="mg-options-grid">
          ${options
            .map(
              (opt, idx) => `
            <button class="doodle-btn mg-opt-btn" data-idx="${idx}" style="${opt.style ?? ''}">
              <span class="mg-opt-badge">${opt.badge ?? String.fromCharCode(65 + idx)}</span>
              <span>${opt.label}</span>
            </button>`,
            )
            .join('')}
        </div>
      </div>
    `;

    const buttons = container.querySelectorAll<HTMLButtonElement>('.mg-opt-btn');
    buttons.forEach((btn) => {
      btn.onclick = () => {
        if (done) return;
        done = true;
        window.removeEventListener('keydown', onKey);
        sound.playUiClick();
        const idx = Number(btn.dataset.idx);
        btn.classList.add('mg-picked');
        buttons.forEach((b) => (b.disabled = true));
        const ok = idx === correctIndex;
        onSubmit(makeInputSubmission(playerId, ok, ok ? 95 : 0, startedAt, { answerIndex: idx }));
      };
    });

    const onKey = (e: KeyboardEvent) => {
      const idx = ['1', '2', '3', '4'].indexOf(e.key);
      if (idx >= 0 && buttons[idx]) {
        e.preventDefault();
        buttons[idx].click();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      done = true;
      window.removeEventListener('keydown', onKey);
    };
  };
};

const renderQuickQuiz: ChallengeRendererFn = (ctx) => {
  const qId = Number(ctx.challenge.params.questionId ?? 0);
  const q = QUIZ_BANK.find((item) => item.id === qId);
  const question = String(ctx.challenge.params.question ?? q?.question ?? '');
  const options = (ctx.challenge.params.options as string[]) ?? q?.options ?? [];
  return renderFourOptionMcq(
    `<div class="mg-quiz-text">${question}</div>`,
    options.map((label) => ({ label })),
    q?.correctIndex ?? 0,
  )(ctx);
};

const renderQuickMath: ChallengeRendererFn = (ctx) => {
  const expr = String(ctx.challenge.params.expression ?? '1 + 1');
  const options = (ctx.challenge.params.options as number[]) ?? [];
  const correctIndex = Number(ctx.challenge.params.correctIndex ?? 0);
  return renderFourOptionMcq(
    `<div class="mg-math-expr">${expr} = ?</div>`,
    options.map((n) => ({ label: String(n) })),
    correctIndex,
  )(ctx);
};

const renderShadowMatch: ChallengeRendererFn = (ctx) => {
  const targetShape = String(ctx.challenge.params.targetShape ?? 'cat');
  const options = (ctx.challenge.params.options as Array<{ label: string; shape: string }>) ?? [];
  const correctIndex = Number(ctx.challenge.params.correctIndex ?? 0);
  const startedAt = performance.now();
  let done = false;

  ctx.container.innerHTML = `
    <div class="mg-wrap">
      <div class="mg-shadow-box">${renderDoodleSvg(targetShape, true)}</div>
      <div class="mg-options-grid">
        ${options
          .map(
            (opt, idx) => `
          <button class="doodle-btn mg-opt-btn mg-shadow-opt" data-idx="${idx}">
            ${renderDoodleSvg(opt.shape, false)}
            <small>${opt.label}</small>
          </button>`,
          )
          .join('')}
      </div>
    </div>
  `;

  ctx.container.querySelectorAll<HTMLButtonElement>('.mg-opt-btn').forEach((btn) => {
    btn.onclick = () => {
      if (done) return;
      done = true;
      ctx.sound.playUiClick();
      const idx = Number(btn.dataset.idx);
      ctx.container.querySelectorAll<HTMLButtonElement>('.mg-opt-btn').forEach((b) => (b.disabled = true));
      ctx.onSubmit(
        makeInputSubmission(ctx.playerId, idx === correctIndex, idx === correctIndex ? 90 : 0, startedAt, {
          answerIndex: idx,
        }),
      );
    };
  });
  return () => {
    done = true;
  };
};

const renderStroopColor: ChallengeRendererFn = (ctx) => {
  const wordLabel = String(ctx.challenge.params.wordLabel ?? 'MERAH');
  const inkHex = String(ctx.challenge.params.inkHex ?? '#2B7FFF');
  const inkPattern = String(ctx.challenge.params.inkPattern ?? 'circle');
  const options = (ctx.challenge.params.options as Array<{ label: string; hex: string; pattern: string }>) ?? [];
  const correctIndex = Number(ctx.challenge.params.correctIndex ?? 0);

  const hintBadge = ctx.colorblindMode
    ? `<span class="mg-cb-badge" title="Penanda buta warna">${renderPatternBadge(inkPattern)}</span>`
    : '';

  return renderFourOptionMcq(
    `<div class="mg-stroop-word" style="color:${inkHex}">${wordLabel} ${hintBadge}</div>
     <div class="mg-sub">Ketuk tombol warna <b>TINTA</b> tulisan di atas!</div>`,
    options.map((o) => ({
      label: o.label,
      badge: ctx.colorblindMode ? renderPatternBadge(o.pattern) : '●',
      style: `border-color:${o.hex}; background:${o.hex}22;`,
    })),
    correctIndex,
  )(ctx);
};

const renderMemoryDoodle: ChallengeRendererFn = ({ challenge, playerId, container, sound, onSubmit }) => {
  const pool = (challenge.params.pool as Array<{ id: string; label: string }>) ?? [];
  const sequence = (challenge.params.sequence as number[]) ?? [];
  const startedAt = performance.now();
  const picked: number[] = [];
  let canClick = false;
  let cancelled = false;

  container.innerHTML = `
    <div class="mg-wrap">
      <div class="mg-sub" id="mg-mem-status">Perhatikan urutannya dulu ya...</div>
      <div class="mg-mem-dots">${sequence.map((_, i) => `<span class="mg-dot" data-dot="${i}"></span>`).join('')}</div>
      <div class="mg-options-grid">
        ${pool
          .map(
            (item, idx) => `
          <button class="doodle-btn mg-mem-btn" data-idx="${idx}" disabled>
            ${renderDoodleSvg(item.id, false)}
            <span>${item.label}</span>
          </button>`,
          )
          .join('')}
      </div>
    </div>
  `;

  const statusEl = container.querySelector<HTMLElement>('#mg-mem-status')!;
  const btns = Array.from(container.querySelectorAll<HTMLButtonElement>('.mg-mem-btn'));

  // Play sequence showcase
  const timers: number[] = [];
  sequence.forEach((poolIdx, step) => {
    const t1 = window.setTimeout(() => {
      if (cancelled) return;
      statusEl.textContent = `Perhatikan urutan ${step + 1} / ${sequence.length}...`;
      btns[poolIdx]?.classList.add('mg-mem-flash');
      sound.playBoing(step);
    }, 360 + step * 500);
    const t2 = window.setTimeout(() => {
      if (cancelled) return;
      btns[poolIdx]?.classList.remove('mg-mem-flash');
    }, 360 + step * 500 + 340);
    timers.push(t1, t2);
  });

  const readyTimer = window.setTimeout(() => {
    if (cancelled) return;
    canClick = true;
    statusEl.textContent = `Giliranmu! Ketuk ${sequence.length} gambar secara berurutan!`;
    btns.forEach((b) => (b.disabled = false));
  }, 400 + sequence.length * 500);
  timers.push(readyTimer);

  btns.forEach((btn) => {
    btn.onclick = () => {
      if (!canClick || cancelled) return;
      const idx = Number(btn.dataset.idx);
      picked.push(idx);
      sound.playUiClick();
      const dot = container.querySelector<HTMLElement>(`[data-dot="${picked.length - 1}"]`);
      dot?.classList.add('filled');

      if (picked.length >= sequence.length) {
        canClick = false;
        btns.forEach((b) => (b.disabled = true));
        const ok = sequence.every((val, i) => picked[i] === val);
        onSubmit(makeInputSubmission(playerId, ok, ok ? 100 : 10, startedAt, { sequenceIndices: picked }));
      }
    };
  });

  return () => {
    cancelled = true;
    timers.forEach(clearTimeout);
  };
};

const renderSpamTap: ChallengeRendererFn = ({ challenge, playerId, container, sound, onSubmit }) => {
  const target = Number(challenge.params.targetTaps ?? 13);
  const windowMs = Number(challenge.params.windowMs ?? 7000);
  const startedAt = performance.now();
  const tapTimestamps: number[] = [];
  let finished = false;

  container.innerHTML = `
    <div class="mg-wrap">
      <div class="mg-spam-count"><span id="mg-taps">0</span> / ${target} ketukan!</div>
      <div class="mg-meter"><div class="mg-meter-fill" id="mg-spam-bar"></div></div>
      <button class="doodle-btn doodle-btn-primary mg-spam-btn" id="mg-spam-btn">KETUK CEPAT! (Spasi / Klik)</button>
    </div>
  `;

  const countEl = container.querySelector<HTMLElement>('#mg-taps')!;
  const barEl = container.querySelector<HTMLElement>('#mg-spam-bar')!;
  const btn = container.querySelector<HTMLButtonElement>('#mg-spam-btn')!;

  const submitNow = () => {
    if (finished) return;
    finished = true;
    window.removeEventListener('keydown', onKeyDown);
    btn.disabled = true;
    const ok = tapTimestamps.length >= target;
    onSubmit(
      makeInputSubmission(playerId, ok, tapTimestamps.length, startedAt, {
        tapTimestamps,
        completedAt: Math.min(windowMs, Math.round(performance.now() - startedAt)),
      }),
    );
  };

  btn.onclick = () => {
    if (finished) return;
    const rel = Math.max(0, Math.round(performance.now() - startedAt));
    tapTimestamps.push(rel);
    sound.playBoing(tapTimestamps.length);
    countEl.textContent = String(tapTimestamps.length);
    barEl.style.width = `${Math.min(100, (tapTimestamps.length / target) * 100)}%`;
    if (tapTimestamps.length >= target) {
      submitNow();
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      btn.click();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  const timer = window.setTimeout(submitNow, windowMs);
  return () => {
    finished = true;
    clearTimeout(timer);
    window.removeEventListener('keydown', onKeyDown);
  };
};

const renderSwipeDodge: ChallengeRendererFn = ({ challenge, playerId, container, sound, onSubmit }) => {
  const obstacles = (challenge.params.obstacles as Array<{ lane: number; timeMs: number }>) ?? [];
  const durationMs = Number(challenge.params.durationMs ?? 6500);
  const maxHitsAllowed = Number(challenge.params.maxHitsAllowed ?? 1);
  const startedAt = performance.now();

  let lane = 1;
  let hits = 0;
  let stopped = false;
  const hitSet = new Set<number>();

  container.innerHTML = `
    <div class="mg-wrap">
      <div class="mg-sub">Maksimal kena: <b>${maxHitsAllowed}x</b> | Kena: <b id="mg-hits">0</b></div>
      <div class="mg-dodge-arena" id="mg-arena">
        <div class="mg-lane"></div><div class="mg-lane"></div><div class="mg-lane"></div>
        <div class="mg-dodge-player" id="mg-player">${renderPawnAvatarSvg('kucing', '#FFD15C', 34)}</div>
      </div>
      <div class="mg-dodge-controls">
        <button class="doodle-btn" id="mg-left">← Kiri</button>
        <button class="doodle-btn" id="mg-right">Kanan →</button>
      </div>
    </div>
  `;

  const arena = container.querySelector<HTMLElement>('#mg-arena')!;
  const playerEl = container.querySelector<HTMLElement>('#mg-player')!;
  const hitsEl = container.querySelector<HTMLElement>('#mg-hits')!;

  const obEls = obstacles.map((_, idx) => {
    const el = document.createElement('div');
    el.className = 'mg-dodge-rock';
    el.innerHTML = renderDodgeRockSvg(idx);
    arena.appendChild(el);
    return el;
  });

  const positionPlayer = () => {
    const arenaW = arena.clientWidth || 280;
    const xPx = ((lane * 33.33 + 16.66) / 100) * arenaW;
    playerEl.style.transform = `translate3d(${xPx}px, 0, 0) translateX(-50%)`;
  };

  const setLane = (next: number) => {
    lane = Math.max(0, Math.min(2, next));
    positionPlayer();
    sound.playUiClick();
  };
  setLane(1);

  container.querySelector<HTMLButtonElement>('#mg-left')!.onclick = () => setLane(lane - 1);
  container.querySelector<HTMLButtonElement>('#mg-right')!.onclick = () => setLane(lane + 1);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      setLane(lane - 1);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      setLane(lane + 1);
    }
  };
  window.addEventListener('keydown', onKeyDown);

  let touchX = 0;
  arena.addEventListener('pointerdown', (e) => {
    touchX = e.clientX;
  });
  arena.addEventListener('pointerup', (e) => {
    const dx = e.clientX - touchX;
    if (Math.abs(dx) > 22) setLane(lane + (dx > 0 ? 1 : -1));
  });

  let rafId = 0;
  const tick = () => {
    if (stopped) return;
    const elapsed = performance.now() - startedAt;
    const arenaW = arena.clientWidth || 280;
    const arenaH = arena.clientHeight || 210;

    obstacles.forEach((ob, idx) => {
      const progress = 1 - (ob.timeMs - elapsed) / 1480;
      const el = obEls[idx];
      if (progress < -0.1 || progress > 1.15) {
        if (el.style.display !== 'none') el.style.display = 'none';
      } else {
        if (el.style.display !== 'flex') el.style.display = 'flex';
        const xPx = ((ob.lane * 33.33 + 16.66) / 100) * arenaW;
        const yPx = progress * arenaH;
        el.style.transform = `translate3d(${xPx}px, ${yPx}px, 0) translate(-50%, -50%)`;
        if (progress > 0.72 && progress < 0.94 && ob.lane === lane && !hitSet.has(idx)) {
          hitSet.add(idx);
          hits++;
          hitsEl.textContent = String(hits);
          sound.playChallengeFail();
          playerEl.classList.add('mg-hit');
          setTimeout(() => playerEl.classList.remove('mg-hit'), 250);
        }
      }
    });

    if (elapsed >= durationMs) {
      stopped = true;
      window.removeEventListener('keydown', onKeyDown);
      onSubmit(
        makeInputSubmission(playerId, hits <= maxHitsAllowed, Math.max(0, 100 - hits * 40), startedAt, {
          hitsTaken: hits,
        }),
      );
      return;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKeyDown);
  };
};

const renderWordScramble: ChallengeRendererFn = ({ challenge, playerId, container, sound, onSubmit }) => {
  const hint = String(challenge.params.hint ?? '');
  const scrambled = (challenge.params.scrambledLetters as string[]) ?? [];
  const word = String(challenge.params.word ?? '');
  const startedAt = performance.now();
  const pickedIndices: number[] = [];
  let done = false;

  const submitWord = () => {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', onKeyDown);
    const text = pickedIndices.map((i) => scrambled[i]).join('');
    onSubmit(makeInputSubmission(playerId, text === word, text === word ? 100 : 0, startedAt, { answerText: text }));
  };

  const renderState = () => {
    const answerText = pickedIndices.map((i) => scrambled[i]).join('');
    const readyToSend = pickedIndices.length === word.length;
    container.innerHTML = `
      <div class="mg-wrap">
        <div class="mg-sub">Petunjuk: <b>${hint}</b> (${word.length} huruf)</div>
        <div class="mg-word-slots">
          ${Array.from(
            { length: word.length },
            (_, i) =>
              `<button type="button" class="mg-letter-slot ${answerText[i] ? 'has-char' : ''}" data-slot="${i}" title="Klik untuk hapus huruf">${answerText[i] ?? '_'}</button>`,
          ).join('')}
        </div>
        <div class="mg-letter-bank">
          ${scrambled
            .map((ch, idx) => {
              const used = pickedIndices.includes(idx);
              return `<button class="doodle-btn mg-letter-btn" data-idx="${idx}" ${used ? 'disabled' : ''}>${ch}</button>`;
            })
            .join('')}
        </div>
        <div class="mg-word-actions">
          <button class="doodle-btn" id="mg-word-clear">Ulang</button>
          <button class="doodle-btn ${readyToSend ? 'doodle-btn-mint' : 'doodle-btn-primary'}" id="mg-word-send">${readyToSend ? '✓ Kirim Jawaban!' : 'Kirim!'}</button>
        </div>
      </div>
    `;

    container.querySelectorAll<HTMLButtonElement>('.mg-letter-btn').forEach((btn) => {
      btn.onclick = () => {
        if (done || pickedIndices.length >= word.length) return;
        sound.playUiClick();
        pickedIndices.push(Number(btn.dataset.idx));
        renderState();
      };
    });

    container.querySelectorAll<HTMLButtonElement>('.mg-letter-slot.has-char').forEach((slotBtn) => {
      slotBtn.onclick = () => {
        if (done) return;
        const slotIdx = Number(slotBtn.dataset.slot);
        if (slotIdx >= 0 && slotIdx < pickedIndices.length) {
          pickedIndices.splice(slotIdx, 1);
          sound.playUiClick();
          renderState();
        }
      };
    });
    container.querySelector<HTMLButtonElement>('#mg-word-clear')!.onclick = () => {
      if (done) return;
      pickedIndices.length = 0;
      renderState();
    };
    container.querySelector<HTMLButtonElement>('#mg-word-send')!.onclick = submitWord;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (done) return;
    if (e.key === 'Backspace') {
      if (pickedIndices.length > 0) {
        e.preventDefault();
        pickedIndices.pop();
        sound.playUiClick();
        renderState();
      }
      return;
    }
    if (e.key === 'Enter' && pickedIndices.length > 0) {
      e.preventDefault();
      submitWord();
      return;
    }
    const ch = e.key.toUpperCase();
    if (/^[A-Z]$/.test(ch) && pickedIndices.length < word.length) {
      const matchIdx = scrambled.findIndex((letter, i) => letter.toUpperCase() === ch && !pickedIndices.includes(i));
      if (matchIdx >= 0) {
        e.preventDefault();
        pickedIndices.push(matchIdx);
        sound.playUiClick();
        renderState();
      }
    }
  };
  window.addEventListener('keydown', onKeyDown);

  renderState();
  return () => {
    done = true;
    window.removeEventListener('keydown', onKeyDown);
  };
};

const renderTraceLine: ChallengeRendererFn = ({ challenge, playerId, container, sound, onSubmit }) => {
  const waypoints = (challenge.params.waypoints as Array<{ x: number; y: number }>) ?? [];
  const minAcc = Number(challenge.params.minAccuracy ?? 0.62);
  const startedAt = performance.now();
  let drawing = false;
  let done = false;
  const drawnPoints: Array<{ x: number; y: number }> = [];

  container.innerHTML = `
    <div class="mg-wrap">
      <div class="mg-sub">Tarik garis dari 🟢 ke ★! Target: <b>${Math.round(minAcc * 100)}%</b> | Akurasi: <b id="mg-trace-acc">0%</b></div>
      <canvas class="mg-trace-canvas" id="mg-trace-canvas" width="300" height="190"></canvas>
      <div class="mg-word-actions">
        <button class="doodle-btn" id="mg-trace-reset">Ulangi Garis</button>
        <button class="doodle-btn doodle-btn-primary" id="mg-trace-send">Kirim!</button>
      </div>
    </div>
  `;

  const canvas = container.querySelector<HTMLCanvasElement>('#mg-trace-canvas')!;
  const accEl = container.querySelector<HTMLElement>('#mg-trace-acc')!;
  const ctx = canvas.getContext('2d')!;

  const computeAccuracy = () => {
    if (drawnPoints.length < 4 || waypoints.length === 0) return 0;
    let covered = 0;
    for (const wp of waypoints) {
      const minD = Math.min(...drawnPoints.map((dp) => Math.hypot(dp.x - wp.x, dp.y - wp.y)));
      if (minD <= 0.17) covered++;
    }
    return Number((covered / Math.max(1, waypoints.length)).toFixed(2));
  };

  const drawGuide = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(43,42,51,0.35)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    waypoints.forEach((wp, i) => {
      const px = wp.x * canvas.width;
      const py = wp.y * canvas.height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    if (waypoints.length > 0) {
      const first = waypoints[0];
      const last = waypoints[waypoints.length - 1];
      ctx.fillStyle = '#6EE7B7';
      ctx.beginPath();
      ctx.arc(first.x * canvas.width, first.y * canvas.height, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFD166';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', last.x * canvas.width, last.y * canvas.height);
    }

    if (drawnPoints.length > 1) {
      ctx.strokeStyle = '#FF8FB1';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      drawnPoints.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x * canvas.width, p.y * canvas.height);
        else ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
      });
      ctx.stroke();
    }
  };
  drawGuide();

  const getNormPos = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const finishTrace = () => {
    if (done || drawnPoints.length < 6) return;
    done = true;
    const accuracy = computeAccuracy();
    sound.playUiClick();
    onSubmit(
      makeInputSubmission(playerId, accuracy >= minAcc, Math.round(accuracy * 100), startedAt, {
        pathAccuracy: accuracy,
        extra: { pointsCount: drawnPoints.length },
      }),
    );
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (done) return;
    drawing = true;
    drawnPoints.push(getNormPos(e));
    drawGuide();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing || done) return;
    const pos = getNormPos(e);
    drawnPoints.push(pos);
    drawGuide();
    const curAcc = computeAccuracy();
    accEl.textContent = `${Math.round(curAcc * 100)}%`;
    const last = waypoints[waypoints.length - 1];
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < 0.1 && drawnPoints.length >= 8 && curAcc >= minAcc) {
      drawing = false;
      finishTrace();
    }
  });
  canvas.addEventListener('pointerup', () => {
    if (!drawing || done) return;
    drawing = false;
    const curAcc = computeAccuracy();
    accEl.textContent = `${Math.round(curAcc * 100)}%`;
    if (drawnPoints.length >= 8 && curAcc >= minAcc) finishTrace();
  });

  container.querySelector<HTMLButtonElement>('#mg-trace-reset')!.onclick = () => {
    if (done) return;
    drawing = false;
    drawnPoints.length = 0;
    accEl.textContent = '0%';
    sound.playUiClick();
    drawGuide();
  };
  container.querySelector<HTMLButtonElement>('#mg-trace-send')!.onclick = () => {
    if (done || drawnPoints.length < 6) return;
    finishTrace();
  };

  return () => {
    done = true;
  };
};

const renderLuckyWheel: ChallengeRendererFn = ({ challenge, playerId, container, sound, onSubmit }) => {
  const slices = (challenge.params.slices as Array<{ label: string; kind: string }>) ?? [];
  const targetIdx = Number(challenge.params.serverOutcomeIndex ?? 0);
  const startedAt = performance.now();
  let spun = false;
  const tickTimers: number[] = [];

  const colors = ['#FFD15C', '#5EE2AD', '#72C0FF', '#FF86AD', '#FFF6E5', '#FF9852'];
  const degPerSlice = 360 / Math.max(1, slices.length);

  container.innerHTML = `
    <div class="mg-wrap">
      <div class="mg-wheel-stage">
        <div class="mg-wheel-pointer">▼</div>
        <div class="mg-wheel" id="mg-wheel" style="background:conic-gradient(${slices
          .map((_, i) => `${colors[i % colors.length]} ${i * degPerSlice}deg ${(i + 1) * degPerSlice}deg`)
          .join(',')})">
          ${slices
            .map((s, i) => {
              const angle = i * degPerSlice + degPerSlice / 2;
              return `<div class="mg-wheel-label" style="transform:rotate(${angle}deg) translateY(-58px)">${s.label.split(' ')[0]}</div>`;
            })
            .join('')}
        </div>
        <div class="mg-wheel-hub">★</div>
      </div>
      <button class="doodle-btn doodle-btn-primary mg-big-btn" id="mg-spin-btn">PUTAR RODA KEBERUNTUNGAN!</button>
    </div>
  `;

  const wheel = container.querySelector<HTMLElement>('#mg-wheel')!;
  const btn = container.querySelector<HTMLButtonElement>('#mg-spin-btn')!;

  btn.onclick = () => {
    if (spun) return;
    spun = true;
    btn.disabled = true;
    sound.playDiceRattle();

    [110, 210, 320, 450, 610, 800, 1020, 1280, 1600, 1980].forEach((ms) => {
      tickTimers.push(window.setTimeout(() => sound.playWheelTick(), ms));
    });

    const sliceMid = targetIdx * degPerSlice + degPerSlice / 2;
    const targetRotation = 360 * 4 + (360 - sliceMid);
    wheel.style.transition = 'transform 2.4s cubic-bezier(0.16, 1, 0.3, 1)';
    wheel.style.transform = `rotate(${targetRotation}deg)`;

    tickTimers.push(
      window.setTimeout(() => {
        const slice = slices[targetIdx];
        const ok = slice?.kind !== 'slip' && slice?.kind !== 'nothing';
        onSubmit(makeInputSubmission(playerId, ok, ok ? 80 : 10, startedAt, {}));
      }, 2550),
    );
  };

  return () => {
    spun = true;
    tickTimers.forEach((id) => clearTimeout(id));
  };
};

const renderQuickDuel: ChallengeRendererFn = ({ challenge, playerId, container, sound, onSubmit }) => {
  const signalDelayMs = Number(challenge.params.signalDelayMs ?? 1700);
  const startedAt = performance.now();
  let signalAt = 0;
  let signalShown = false;
  let done = false;

  container.innerHTML = `
    <div class="mg-wrap">
      <div class="mg-duel-banner" id="mg-duel-box">👀 Tunggu tanda... jangan curi start!</div>
      <button class="doodle-btn doodle-btn-primary mg-big-btn" id="mg-duel-btn">SIAP...</button>
    </div>
  `;

  const box = container.querySelector<HTMLElement>('#mg-duel-box')!;
  const btn = container.querySelector<HTMLButtonElement>('#mg-duel-btn')!;

  const timer = window.setTimeout(() => {
    if (done) return;
    signalShown = true;
    signalAt = performance.now();
    box.textContent = '⚡ TANGKAP SEKARANG!! ⚡';
    box.classList.add('mg-duel-go');
    btn.textContent = 'TANGKAP!';
    sound.playBoing(4);
  }, signalDelayMs);

  btn.onclick = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    btn.disabled = true;
    if (!signalShown) {
      sound.playChallengeFail();
      onSubmit(makeInputSubmission(playerId, false, 0, startedAt, { reactionMs: -150 }));
      return;
    }
    const reactionMs = Math.max(125, Math.round(performance.now() - signalAt));
    sound.playUiClick();
    onSubmit(makeInputSubmission(playerId, true, Math.max(10, 1500 - reactionMs), startedAt, { reactionMs }));
  };

  return () => {
    done = true;
    clearTimeout(timer);
  };
};

const renderGiftTrap: ChallengeRendererFn = ({ challenge, playerId, container, sound, onSubmit }) => {
  const variant = (challenge.params.variant as { kind: string; title: string; flavorText: string }) ?? {
    kind: 'gift',
    title: 'Kejutan!',
    flavorText: 'Ada sesuatu di kotak ini!',
  };
  const startedAt = performance.now();
  let opened = false;
  let done = false;
  const isGift = variant.kind === 'gift';

  container.innerHTML = `
    <div class="mg-wrap">
      <div class="mg-gift-card is-sealed" id="mg-gift-card">
        <div class="mg-gift-art" id="mg-gift-art">${renderGiftBoxSvg(false, false)}</div>
        <h3 id="mg-gift-title">Kotak Misteri Tertutup!</h3>
        <p id="mg-gift-desc">Ketuk kotak untuk membukanya...</p>
      </div>
      <button class="doodle-btn doodle-btn-primary" id="mg-gift-ok">BUKA KOTAK!</button>
    </div>
  `;

  const card = container.querySelector<HTMLElement>('#mg-gift-card')!;
  const art = container.querySelector<HTMLElement>('#mg-gift-art')!;
  const titleEl = container.querySelector<HTMLElement>('#mg-gift-title')!;
  const descEl = container.querySelector<HTMLElement>('#mg-gift-desc')!;
  const btn = container.querySelector<HTMLButtonElement>('#mg-gift-ok')!;

  const submit = () => {
    if (done) return;
    done = true;
    onSubmit(makeInputSubmission(playerId, isGift, isGift ? 100 : 25, startedAt, {}));
  };

  let finishTimer = 0;
  const reveal = () => {
    if (opened || done) return;
    opened = true;
    card.classList.remove('is-sealed');
    card.classList.add(isGift ? 'is-gift' : 'is-trap');
    art.innerHTML = renderGiftBoxSvg(!isGift, true);
    titleEl.textContent = variant.title;
    descEl.textContent = variant.flavorText;
    btn.textContent = 'Ambil Hasil!';
    btn.onclick = submit;
    if (isGift) sound.playChallengeSuccess();
    else sound.playChallengeFail();
    finishTimer = window.setTimeout(submit, 1500);
  };

  btn.onclick = reveal;
  card.onclick = reveal;
  const autoRevealTimer = window.setTimeout(reveal, 1300);

  return () => {
    done = true;
    clearTimeout(autoRevealTimer);
    clearTimeout(finishTimer);
  };
};

const renderBossDoodle: ChallengeRendererFn = ({ challenge, playerId, container, sound, onSubmit }) => {
  const math = challenge.params.math as { expression: string; options: number[]; correctIndex: number };
  const timing = challenge.params.timing as { zoneCenter: number; zoneWidth: number; speed: number };
  const targetTaps = Number(challenge.params.targetTaps ?? 6);
  const startedAt = performance.now();

  let stage = 1;
  let mathIndex = -1;
  let needlePos = 0;
  const tapTimestamps: number[] = [];
  let done = false;
  let rafId = 0;

  const bossBanner = (hpStagesLeft: number) => {
    const ratio = hpStagesLeft / 3;
    return `
      <div class="mg-boss-header">
        <div class="mg-boss-sprite">${renderBossDoodleSvg(ratio)}</div>
        <div class="mg-boss-hp-col">
          <div class="mg-boss-name">BOS DOODLE (Kastil Awan)</div>
          <div class="mg-boss-hp-track">
            <div class="mg-boss-hp-fill" style="width:${Math.max(5, Math.round(ratio * 100))}%"></div>
          </div>
        </div>
      </div>
    `;
  };

  const renderStage = () => {
    cancelAnimationFrame(rafId);
    if (done) return;

    if (stage === 1) {
      container.innerHTML = `
        <div class="mg-wrap">
          ${bossBanner(3)}
          <div class="mg-sub">Tahap 1/3: Hitung Cepat Pertahanan Bos!</div>
          <div class="mg-math-expr">${math.expression} = ?</div>
          <div class="mg-options-grid">
            ${math.options.map((n, i) => `<button class="doodle-btn mg-opt-btn" data-idx="${i}">${n}</button>`).join('')}
          </div>
        </div>
      `;
      container.querySelectorAll<HTMLButtonElement>('.mg-opt-btn').forEach((b) => {
        b.onclick = () => {
          mathIndex = Number(b.dataset.idx);
          sound.playUiClick();
          stage = 2;
          renderStage();
        };
      });
    } else if (stage === 2) {
      container.innerHTML = `
        <div class="mg-wrap">
          ${bossBanner(2)}
          <div class="mg-sub">Tahap 2/3: Bidik Perisai Bos! (Klik / Spasi)</div>
          <div class="mg-timing-track" id="mg-boss-track">
            <div class="mg-timing-zone" style="left:${(timing.zoneCenter - timing.zoneWidth / 2) * 100}%;width:${timing.zoneWidth * 100}%"></div>
            <div class="mg-timing-needle" id="mg-boss-needle"></div>
          </div>
          <button class="doodle-btn doodle-btn-primary mg-big-btn" id="mg-boss-tap">SERANG PERISAI!</button>
        </div>
      `;
      const track = container.querySelector<HTMLElement>('#mg-boss-track')!;
      const needle = container.querySelector<HTMLElement>('#mg-boss-needle')!;
      const t0 = performance.now();
      const loop = () => {
        if (done || stage !== 2) return;
        needlePos = (Math.sin(((performance.now() - t0) / 1000) * timing.speed * Math.PI * 2) + 1) * 0.5;
        const trackW = track.clientWidth || 300;
        needle.style.transform = `translate3d(${needlePos * trackW}px, 0, 0) translateX(-50%)`;
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);

      container.querySelector<HTMLButtonElement>('#mg-boss-tap')!.onclick = () => {
        cancelAnimationFrame(rafId);
        sound.playUiClick();
        stage = 3;
        renderStage();
      };
    } else {
      container.innerHTML = `
        <div class="mg-wrap">
          ${bossBanner(1)}
          <div class="mg-sub">Tahap 3/3: Ketuk ${targetTaps}x (Klik / Spasi) untuk menumbangkan Bos Doodle!</div>
          <div class="mg-spam-count"><span id="mg-boss-taps">0</span> / ${targetTaps}</div>
          <button class="doodle-btn doodle-btn-primary mg-spam-btn" id="mg-boss-spam">SERANG AKHIR!</button>
        </div>
      `;
      const countEl = container.querySelector<HTMLElement>('#mg-boss-taps')!;
      container.querySelector<HTMLButtonElement>('#mg-boss-spam')!.onclick = () => {
        if (done) return;
        tapTimestamps.push(Math.max(10, Math.round(performance.now() - startedAt)));
        sound.playBoing(tapTimestamps.length);
        countEl.textContent = String(tapTimestamps.length);
        if (tapTimestamps.length >= targetTaps) {
          done = true;
          window.removeEventListener('keydown', onKeyDown);
          let passed = 1; // spam passed
          if (mathIndex === math.correctIndex) passed++;
          if (Math.abs(needlePos - timing.zoneCenter) <= timing.zoneWidth / 2 + 0.035) passed++;
          onSubmit(
            makeInputSubmission(playerId, passed >= 2, passed * 40, startedAt, {
              tapTimestamps,
              bossStagesPassed: passed,
              extra: { mathIndex, needlePos },
            }),
          );
        }
      };
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (done || e.repeat) return;
    if (e.code === 'Space' || e.key === 'Enter') {
      if (stage === 2) {
        e.preventDefault();
        container.querySelector<HTMLButtonElement>('#mg-boss-tap')?.click();
      } else if (stage === 3) {
        e.preventDefault();
        container.querySelector<HTMLButtonElement>('#mg-boss-spam')?.click();
      }
    }
  };
  window.addEventListener('keydown', onKeyDown);

  renderStage();
  return () => {
    done = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKeyDown);
  };
};

const renderBubblePop: ChallengeRendererFn = ({ challenge, playerId, container, sound, onSubmit }) => {
  const targetColor = (challenge.params.targetColor as { label: string; hex: string }) ?? {
    label: 'Merah Muda',
    hex: '#ff6b8b',
  };
  const targetPops = Number(challenge.params.targetPops ?? 5);
  const maxBombHits = Number(challenge.params.maxBombHits ?? 1);
  const bubbles = (challenge.params.bubbles as Array<{
    id: number;
    kind: 'good' | 'bomb';
    xPct: number;
    yPct: number;
    sizePx: number;
    colorHex: string;
  }>) ?? [];

  const startedAt = performance.now();
  const tapTimestamps: number[] = [];
  let goodPopped = 0;
  let bombsHit = 0;
  let done = false;

  const submitResult = () => {
    if (done) return;
    done = true;
    const ok = goodPopped >= targetPops && bombsHit <= maxBombHits;
    onSubmit(
      makeInputSubmission(playerId, ok, Math.max(0, goodPopped * 20 - bombsHit * 25), startedAt, {
        tapTimestamps,
        hitsTaken: bombsHit,
        extra: { goodPopped },
      }),
    );
  };

  container.innerHTML = `
    <div class="mg-wrap">
      <div class="mg-sub">
        Pecah <b id="mg-bpop-count">0</b> / ${targetPops} ★ (<span style="color:${targetColor.hex};font-weight:700">${targetColor.label}</span>)
        | Bom: <b id="mg-bpop-bomb">0</b>/${maxBombHits}
      </div>
      <div class="mg-bubble-arena" id="mg-bubble-arena">
        ${bubbles
          .map(
            (b) => `
          <button
            class="mg-bubble-btn ${b.kind === 'bomb' ? 'is-bomb' : 'is-good'}"
            data-id="${b.id}"
            data-kind="${b.kind}"
            style="left:${b.xPct}%;top:${b.yPct}%;width:${b.sizePx}px;height:${b.sizePx}px;background:${b.colorHex};animation-delay:${(b.id % 5) * 0.2}s"
          >${b.kind === 'bomb' ? renderItemSvg('sabotage', 22) : '★'}</button>
        `,
          )
          .join('')}
      </div>
    </div>
  `;

  const countEl = container.querySelector<HTMLElement>('#mg-bpop-count')!;
  const bombEl = container.querySelector<HTMLElement>('#mg-bpop-bomb')!;

  container.querySelectorAll<HTMLButtonElement>('.mg-bubble-btn').forEach((btn) => {
    btn.onclick = () => {
      if (done || btn.disabled) return;
      btn.disabled = true;
      btn.classList.add('is-popped');
      const offset = Math.max(150, Math.round(performance.now() - startedAt));
      tapTimestamps.push(offset);

      if (btn.dataset.kind === 'bomb') {
        bombsHit += 1;
        bombEl.textContent = String(bombsHit);
        sound.playChallengeFail();
        if (bombsHit > maxBombHits) {
          submitResult();
        }
      } else {
        goodPopped += 1;
        countEl.textContent = String(goodPopped);
        sound.playBubblePop(goodPopped);
        if (goodPopped >= targetPops) {
          submitResult();
        }
      }
    };
  });

  const timeoutTimer = window.setTimeout(submitResult, Math.max(3000, challenge.durationMs - 450));
  return () => {
    done = true;
    clearTimeout(timeoutTimer);
  };
};

const renderRhythmClap: ChallengeRendererFn = ({ challenge, playerId, container, sound, onSubmit }) => {
  const beatTargetsMs = (challenge.params.beatTargetsMs as number[]) ?? [1050, 1900, 2750, 3600];
  const toleranceMs = Number(challenge.params.toleranceMs ?? 280);
  const requiredHits = Number(challenge.params.requiredHits ?? 3);
  const startedAt = performance.now();
  const tapTimestamps: number[] = [];
  let done = false;

  container.innerHTML = `
    <div class="mg-wrap">
      <div class="mg-sub">Ketuk drum saat not jatuh masuk ke zona garis! Target: <b>${requiredHits}/${beatTargetsMs.length}</b></div>
      <div class="mg-rhythm-lane" id="mg-rhythm-lane">
        <div class="mg-rhythm-target">DRUM</div>
        ${beatTargetsMs.map((_, i) => `<div class="mg-rhythm-note" id="mg-rnote-${i}">♪</div>`).join('')}
      </div>
      <div class="mg-sub" id="mg-rhythm-feedback">Siap-siap dengar & lihat ketukan...</div>
      <button class="doodle-btn doodle-btn-primary mg-big-btn" id="mg-rhythm-btn">TEPUK IRAMA! (Spasi)</button>
    </div>
  `;

  const btn = container.querySelector<HTMLButtonElement>('#mg-rhythm-btn')!;
  const fb = container.querySelector<HTMLElement>('#mg-rhythm-feedback')!;
  const noteEls = beatTargetsMs.map((_, i) => container.querySelector<HTMLElement>(`#mg-rnote-${i}`)!);
  const cuedSet = new Set<number>();

  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', onKeyDown);
    const used = new Set<number>();
    let matched = 0;
    for (const target of beatTargetsMs) {
      let best = -1;
      let bestDiff = Infinity;
      tapTimestamps.forEach((t, i) => {
        if (used.has(i)) return;
        const d = Math.abs(t - target);
        if (d <= toleranceMs && d < bestDiff) {
          bestDiff = d;
          best = i;
        }
      });
      if (best >= 0) {
        used.add(best);
        matched++;
      }
    }
    const ok = matched >= requiredHits;
    onSubmit(
      makeInputSubmission(playerId, ok, matched * 25, startedAt, {
        tapTimestamps,
      }),
    );
  };

  btn.onclick = () => {
    if (done) return;
    const t = Math.max(10, Math.round(performance.now() - startedAt));
    tapTimestamps.push(t);
    const hitClose = beatTargetsMs.some((target) => Math.abs(target - t) <= toleranceMs);
    if (hitClose) {
      sound.playBubblePop(tapTimestamps.length);
      fb.textContent = '✨ PAS IRAMA!';
    } else {
      sound.playUiClick();
      fb.textContent = '😅 Agak meleset!';
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      btn.click();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  const rhythmLane = container.querySelector<HTMLElement>('#mg-rhythm-lane')!;
  let rafId = 0;
  const endMs = (beatTargetsMs[beatTargetsMs.length - 1] ?? 3600) + toleranceMs + 280;
  const tick = () => {
    if (done) return;
    const elapsed = performance.now() - startedAt;
    const laneW = rhythmLane.clientWidth || 300;
    beatTargetsMs.forEach((target, i) => {
      const el = noteEls[i];
      const delta = target - elapsed;
      if (!cuedSet.has(i) && delta <= 40) {
        cuedSet.add(i);
        sound.playBeatCue(i === beatTargetsMs.length - 1);
      }
      const pct = Math.max(4, Math.min(92, 82 - ((950 - delta) / 950) * 68));
      el.style.opacity = delta > 1050 || delta < -350 ? '0.15' : '1';
      el.style.transform = `translate3d(${(pct / 100) * laneW}px, -50%, 0) translateX(-50%)`;
    });
    if (elapsed >= endMs) {
      finish();
      return;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return () => {
    done = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKeyDown);
  };
};

const renderColorCount: ChallengeRendererFn = (ctx) => {
  const questionText = String(ctx.challenge.params.questionText ?? 'Hitung stiker target!');
  const items = (ctx.challenge.params.items as Array<{
    symbol: string;
    colorHex: string;
    colorId: string;
    rotDeg: number;
  }>) ?? [];
  const options = (ctx.challenge.params.options as number[]) ?? [2, 3, 4, 5];
  const correctIndex = Number(ctx.challenge.params.correctIndex ?? 0);

  const canvasHtml = `
    <div style="margin-bottom:8px;font-weight:700">${questionText}</div>
    <div class="mg-count-box">
      ${items
        .map(
          (item) => `
        <span class="mg-count-item" style="color:${item.colorHex};transform:rotate(${item.rotDeg}deg)">
          ${item.symbol}${ctx.colorblindMode ? `<small class="mg-cb-tag">${item.colorId[0].toUpperCase()}</small>` : ''}
        </span>`,
        )
        .join('')}
    </div>
  `;
  return renderFourOptionMcq(
    canvasHtml,
    options.map((n) => ({ label: `${n} buah` })),
    correctIndex,
  )(ctx);
};

const renderBalanceBar: ChallengeRendererFn = ({ challenge, playerId, container, sound, onSubmit }) => {
  const safeWidthPct = Number(challenge.params.safeWidthPct ?? 36);
  const targetRatio = Number(challenge.params.targetRatio ?? 0.54);
  const maxDrops = Number(challenge.params.maxDrops ?? 2);
  const windPattern = Number(challenge.params.windPattern ?? 77);
  const durationMs = Math.round(Number(challenge.params.durationSec ?? 5.5) * 1000);
  const startedAt = performance.now();

  let pos = 50; // 0..100
  let vel = (windPattern % 2 === 0 ? 1 : -1) * 10;
  let framesTotal = 0;
  let framesSafe = 0;
  let drops = 0;
  let wasOut = false;
  let done = false;
  const tapTimestamps: number[] = [];

  const safeMin = 50 - safeWidthPct / 2;
  const safeMax = 50 + safeWidthPct / 2;

  container.innerHTML = `
    <div class="mg-wrap">
      <div class="mg-sub">Pertahankan di zona hijau (${Math.round(targetRatio * 100)}%)! Jatuh: <b id="mg-bal-drops">0</b>/${maxDrops}</div>
      <div class="mg-balance-track" id="mg-balance-track">
        <div class="mg-timing-zone" style="left:${safeMin}%;width:${safeWidthPct}%"></div>
        <div class="mg-balance-marker" id="mg-bal-marker">PEN</div>
      </div>
      <div class="mg-sub">Kestabilan: <b id="mg-bal-pct">100%</b></div>
      <div class="mg-dodge-controls">
        <button class="doodle-btn" id="mg-bal-left">← Kiri (A)</button>
        <button class="doodle-btn" id="mg-bal-right">Kanan (D) →</button>
      </div>
    </div>
  `;

  const balTrack = container.querySelector<HTMLElement>('#mg-balance-track')!;
  const marker = container.querySelector<HTMLElement>('#mg-bal-marker')!;
  const dropsEl = container.querySelector<HTMLElement>('#mg-bal-drops')!;
  const pctEl = container.querySelector<HTMLElement>('#mg-bal-pct')!;

  const nudge = (dir: -1 | 1) => {
    if (done) return;
    vel += dir * 22;
    pos = Math.max(4, Math.min(96, pos + dir * 5));
    tapTimestamps.push(Math.max(50, Math.round(performance.now() - startedAt)));
    sound.playUiClick();
  };

  container.querySelector<HTMLButtonElement>('#mg-bal-left')!.onclick = () => nudge(-1);
  container.querySelector<HTMLButtonElement>('#mg-bal-right')!.onclick = () => nudge(1);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      nudge(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      nudge(1);
    }
  };
  window.addEventListener('keydown', onKeyDown);

  let lastMs = startedAt;
  let rafId = 0;
  const tick = () => {
    if (done) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastMs) / 1000);
    lastMs = now;
    const elapsed = now - startedAt;

    const windAccel =
      Math.sin((elapsed / 1000) * 2.1 + windPattern) * 30 +
      Math.cos((elapsed / 1000) * 1.2 + windPattern * 0.5) * 16;
    vel = vel * 0.94 + windAccel * dt;
    pos = Math.max(2, Math.min(98, pos + vel * dt));
    const balW = balTrack.clientWidth || 300;
    marker.style.transform = `translate3d(${(pos / 100) * balW}px, -50%, 0) translateX(-50%)`;

    framesTotal++;
    const inSafe = pos >= safeMin && pos <= safeMax;
    if (inSafe) {
      framesSafe++;
      wasOut = false;
    } else if ((pos <= 6 || pos >= 94) && !wasOut) {
      wasOut = true;
      drops++;
      dropsEl.textContent = String(drops);
      sound.playChallengeFail();
      vel *= -0.5;
    }

    const ratio = framesTotal > 0 ? framesSafe / framesTotal : 1;
    pctEl.textContent = `${Math.round(ratio * 100)}%`;

    if (elapsed >= durationMs) {
      done = true;
      window.removeEventListener('keydown', onKeyDown);
      const finalRatio = Number(ratio.toFixed(2));
      const ok = finalRatio >= targetRatio && drops <= maxDrops;
      onSubmit(
        makeInputSubmission(playerId, ok, Math.round(finalRatio * 100), startedAt, {
          tapTimestamps: tapTimestamps.length >= 2 ? tapTimestamps : [300, 900],
          hitsTaken: drops,
          extra: { balanceRatio: finalRatio },
        }),
      );
      return;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return () => {
    done = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKeyDown);
  };
};

export const CLIENT_CHALLENGE_RENDERERS: Record<string, ChallengeRendererFn> = {
  tap_timing: renderTapTiming,
  quick_quiz: renderQuickQuiz,
  memory_doodle: renderMemoryDoodle,
  spam_tap: renderSpamTap,
  swipe_dodge: renderSwipeDodge,
  shadow_match: renderShadowMatch,
  quick_math: renderQuickMath,
  word_scramble: renderWordScramble,
  trace_line: renderTraceLine,
  lucky_wheel: renderLuckyWheel,
  stroop_color: renderStroopColor,
  quick_duel: renderQuickDuel,
  gift_trap: renderGiftTrap,
  bubble_pop: renderBubblePop,
  rhythm_clap: renderRhythmClap,
  color_count: renderColorCount,
  balance_bar: renderBalanceBar,
  boss_doodle: renderBossDoodle,
};
