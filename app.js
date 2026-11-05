/* ── 數學之塔 主程式 ── */
(() => {
  'use strict';

  const $app = document.getElementById('app');
  const $homeBtn = document.getElementById('homeBtn');
  const $muteBtn = document.getElementById('muteBtn');

  /* ── 星空背景 ── */
  (function makeStars() {
    const box = document.getElementById('stars');
    const n = Math.min(90, Math.floor(window.innerWidth / 14));
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'star';
      const size = Math.random() * 2 + 1;
      s.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;width:${size}px;height:${size}px;animation-delay:${(Math.random() * 4).toFixed(2)}s`;
      box.appendChild(s);
    }
  })();

  /* ── 音效（Web Audio 程序化產生） ── */
  let audioCtx = null, muted = false, bgmTimer = null, bgmStep = 0;
  const ensureAudio = () => {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  };
  const tone = (freq, dur = 0.12, type = 'sine', vol = 0.18, delay = 0) => {
    const ctx = ensureAudio(); if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur);
  };
  const sfx = {
    click:  () => tone(620, 0.07, 'triangle', 0.12),
    correct:() => { tone(523, .12, 'sine', .16); tone(659, .12, 'sine', .16, .1); tone(784, .2, 'sine', .16, .2); },
    wrong:  () => { tone(220, .22, 'sawtooth', .1); tone(160, .3, 'sawtooth', .08, .12); },
    combo:  (n) => tone(700 + Math.min(n, 8) * 90, .1, 'triangle', .12),
    win:    () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .3, 'sine', .15, i * .14)),
    lose:  () => [392, 330, 262].forEach((f, i) => tone(f, .35, 'triangle', .12, i * .18)),
  };
  const BGM_NOTES = [262, 311, 349, 392, 349, 311, 294, 247];
  const startBGM = () => {
    if (bgmTimer || muted) return;
    bgmTimer = setInterval(() => {
      if (muted) return;
      tone(BGM_NOTES[bgmStep % BGM_NOTES.length], 1.4, 'sine', 0.045);
      if (bgmStep % 4 === 0) tone(BGM_NOTES[bgmStep % BGM_NOTES.length] / 2, 1.8, 'sine', 0.03);
      bgmStep++;
    }, 640);
  };
  const stopBGM = () => { clearInterval(bgmTimer); bgmTimer = null; };
  document.addEventListener('pointerdown', () => { ensureAudio(); startBGM(); }, { once: true });

  $muteBtn.addEventListener('click', () => {
    muted = !muted;
    $muteBtn.textContent = muted ? '🔇' : '🔊';
    if (muted) stopBGM(); else { ensureAudio(); startBGM(); }
  });

  /* ── 狀態 ── */
  const QUESTION_TIME = 75;
  const state = {
    screen: 'home',
    mode: null,          // topic id 或 'mixed'
    qs: [], idx: 0,
    score: 0, hearts: 3, combo: 0, maxCombo: 0, correct: 0,
    answers: [],         // {q, ok}
    timer: null, timeLeft: QUESTION_TIME,
    reviveMode: false,   // 愛心耗盡後的複習模式
    best: {},            // chapterId -> stars (本次連線)
  };
  let answered = false;

  /* ── 工具 ── */
  const topicOf = (id) => TOPICS.find(t => t.id === id);
  const renderMath = (el) => {
    if (window.renderMathInElement) {
      window.renderMathInElement(el, {
        delimiters: [{ left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }],
        throwOnError: false,
      });
    }
  };
  const starsFor = (correct, total) => {
    const r = correct / total;
    if (r >= 0.84) return 3;
    if (r >= 0.67) return 2;
    if (r >= 0.5) return 1;
    return 0;
  };
  const starRow = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* ── 首頁 ── */
  function renderHome() {
    stopTimer();
    state.screen = 'home';
    const cards = TOPICS.map(t => {
      const best = state.best[t.id] ?? -1;
      return `
      <button class="chapter-card" data-topic="${t.id}">
        <div class="ch-icon">${t.icon}</div>
        <h3>${t.name}</h3>
        <p class="ch-desc">${t.desc}</p>
        <div class="ch-meta">
          <span>6 題 · ${best >= 0 ? '最佳 ' + starRow(best) : '尚未挑戰'}</span>
        </div>
      </button>`;
    }).join('');

    $app.innerHTML = `
    <div class="screen-anim">
      <div class="hero">
        <h1>數學之塔</h1>
        <p>學測數學複習解謎 — 闖關答題、蒐集星星、攻下每一層樓</p>
      </div>
      <div class="mode-row">
        <button class="mode-card" data-mode="mixed">
          <div class="mode-icon">🌠</div>
          <h3>綜合挑戰</h3>
          <p>跨章節隨機 10 題，測驗整體實力</p>
        </button>
        <button class="mode-card" data-mode="guide">
          <div class="mode-icon">📖</div>
          <h3>玩法說明</h3>
          <p>規則、計分與星級一看就懂</p>
        </button>
      </div>
      <div class="section-title">選擇章節</div>
      <div class="chapter-grid">${cards}</div>
    </div>`;
    renderMath($app);

    $app.querySelectorAll('.chapter-card').forEach(btn => {
      btn.addEventListener('click', () => { sfx.click(); startChapter(btn.dataset.topic); });
    });
    $app.querySelector('[data-mode="mixed"]').addEventListener('click', () => { sfx.click(); startMixed(); });
    $app.querySelector('[data-mode="guide"]').addEventListener('click', () => { sfx.click(); renderGuide(); });
  }

  function renderGuide() {
    state.screen = 'guide';
    $app.innerHTML = `
    <div class="screen-anim">
      <div class="q-card">
        <div class="q-top"><span class="q-badge">玩法說明</span></div>
        <div class="q-text" style="font-weight:400">
          <p><b>❤️ 生命：</b>每章 3 顆愛心，答錯或逾時扣 1 顆。愛心耗盡時可選擇「複習模式」繼續闖關（不再扣心）。</p>
          <p style="margin-top:12px"><b>⏱ 限時：</b>每題 75 秒，答越快分數越高。</p>
          <p style="margin-top:12px"><b>🔥 連擊：</b>連續答對可累積連擊加分，答錯即歸零。</p>
          <p style="margin-top:12px"><b>⭐ 星級：</b>依答對率給 1~3 星：84% 以上 3 星、67% 以上 2 星、50% 以上 1 星。</p>
          <p style="margin-top:12px"><b>📝 解析：</b>每題作答後都會顯示詳細解題步驟，錯的題目一定要看懂再走。</p>
        </div>
        <button class="next-btn" id="guideBack">返回關卡列表</button>
      </div>
    </div>`;
    $app.querySelector('#guideBack').addEventListener('click', () => { sfx.click(); renderHome(); });
  }

  /* ── 開始遊戲 ── */
  function startChapter(topicId) {
    state.mode = topicId;
    state.qs = QUESTIONS.filter(q => q.topic === topicId).sort((a, b) => a.level - b.level);
    beginRun();
  }
  function startMixed() {
    state.mode = 'mixed';
    const pool = [...QUESTIONS].sort(() => Math.random() - 0.5).slice(0, 10);
    state.qs = pool.sort((a, b) => a.level - b.level);
    beginRun();
  }
  /* 打亂選項並重新對應正確答案索引，避免正確答案集中在特定選項 */
  function shuffledQ(q) {
    const order = q.opts.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {   // Fisher-Yates 均勻洗牌
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { ...q, opts: order.map(i => q.opts[i]), ans: order.indexOf(q.ans) };
  }

  function beginRun() {
    state.qs = state.qs.map(shuffledQ);
    Object.assign(state, {
      idx: 0, score: 0, hearts: 3, combo: 0, maxCombo: 0, correct: 0,
      answers: [], reviveMode: false,
    });
    renderQuiz();
  }

  /* ── 遊戲畫面 ── */
  function renderQuiz() {
    state.screen = 'quiz';
    answered = false;
    const q = state.qs[state.idx];
    const topic = topicOf(q.topic);
    const total = state.qs.length;

    $app.innerHTML = `
    <div class="screen-anim">
      <div class="game-hud">
        <div class="hud-item"><span class="hud-hearts" id="hearts"></span></div>
        <div class="hud-item hud-score" id="scoreEl">0 分</div>
        <div class="hud-item"><span class="hud-combo" id="comboEl"></span></div>
        <div class="hud-item" style="color:var(--color-text-faint)">第 ${state.idx + 1} / ${total} 題</div>
      </div>
      <div class="timer-wrap">
        <div class="timer-bar"><div class="timer-fill" id="timerFill"></div></div>
        <div class="timer-nums"><span id="timerNum">75 秒</span><span>${state.mode === 'mixed' ? '綜合挑戰' : topic.name}</span></div>
      </div>
      <div class="q-card" id="qCard">
        <div class="q-top">
          <span class="q-badge">${topic.name}</span>
          <span class="q-level">${'★'.repeat(q.level)}${'☆'.repeat(3 - q.level)} 難度</span>
        </div>
        <div class="q-text">${esc(q.q)}</div>
        <div class="opts" id="opts">
          ${q.opts.map((o, i) => `
            <button class="opt" data-i="${i}">
              <span class="opt-tag">${'ABCD'[i]}</span><span>${esc(o)}</span>
            </button>`).join('')}
        </div>
        <div id="afterBox"></div>
      </div>
    </div>`;

    renderMath($app);
    updateHUD();
    $app.querySelectorAll('.opt').forEach(btn => {
      btn.addEventListener('click', () => answer(+btn.dataset.i));
    });
    startTimer();
  }

  function updateHUD() {
    const h = document.getElementById('hearts');
    if (h) h.innerHTML = state.reviveMode
      ? '🧪 複習模式'
      : '❤️'.repeat(state.hearts) + '<span style="opacity:.25">' + '🖤'.repeat(3 - state.hearts) + '</span>';
    const s = document.getElementById('scoreEl');
    if (s) s.textContent = state.score + ' 分';
    const c = document.getElementById('comboEl');
    if (c) {
      c.textContent = state.combo >= 2 ? `🔥 連擊 x${state.combo}` : '';
      if (state.combo >= 2) { c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
    }
  }

  /* ── 計時器 ── */
  function startTimer() {
    stopTimer();
    state.timeLeft = QUESTION_TIME;
    const fill = document.getElementById('timerFill');
    const num = document.getElementById('timerNum');
    state.timer = setInterval(() => {
      state.timeLeft--;
      if (num) num.textContent = state.timeLeft + ' 秒';
      if (fill) {
        fill.style.width = (state.timeLeft / QUESTION_TIME * 100) + '%';
        if (state.timeLeft <= 15) fill.classList.add('warn');
      }
      if (state.timeLeft <= 0) answer(-1); // 逾時
    }, 1000);
  }
  function stopTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

  /* ── 作答 ── */
  function answer(choice) {
    if (answered) return;
    answered = true;
    stopTimer();
    const q = state.qs[state.idx];
    const ok = choice === q.ans;
    const opts = $app.querySelectorAll('.opt');
    opts.forEach(b => (b.disabled = true));
    opts[q.ans].classList.add('correct');

    if (ok) {
      state.correct++;
      state.combo++;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      const timeBonus = Math.round(state.timeLeft * 1.0);
      const comboBonus = (state.combo - 1) * 20;
      const gain = 100 + timeBonus + comboBonus;
      state.score += gain;
      sfx.correct();
      if (state.combo >= 3) sfx.combo(state.combo);
    } else {
      state.combo = 0;
      if (!state.reviveMode) state.hearts--;
      if (choice >= 0) opts[choice].classList.add('wrong');
      sfx.wrong();
      const card = document.getElementById('qCard');
      if (card) { card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 400); }
    }
    state.answers.push({ q, ok });

    const after = document.getElementById('afterBox');
    const isLast = state.idx === state.qs.length - 1;
    const heartsGone = !state.reviveMode && state.hearts <= 0;

    after.innerHTML = `
      <div class="feedback-banner ${ok ? 'ok' : 'no'}">
        ${ok ? '✓ 答對了！' : (choice === -1 ? '⏰ 時間到！正確答案是 ' + 'ABCD'[q.ans] : '✗ 答錯了，正確答案是 ' + 'ABCD'[q.ans])}
      </div>
      <div class="sol-box"><h4>詳細解析</h4><p>${esc(q.sol).replace(/\n/g, '<br>')}</p></div>
      <button class="next-btn" id="nextBtn">${heartsGone ? '繼續' : (isLast ? '查看結果' : '下一題 →')}</button>`;

    renderMath(after);
    updateHUD();
    after.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('nextBtn').addEventListener('click', () => { sfx.click(); next(); });
  }

  function next() {
    const heartsGone = !state.reviveMode && state.hearts <= 0;
    if (heartsGone) { renderGameOver(); return; }
    if (state.idx === state.qs.length - 1) { renderResult(); return; }
    state.idx++;
    renderQuiz();
  }

  /* ── 愛心耗盡 ── */
  function renderGameOver() {
    stopTimer();
    state.screen = 'over';
    sfx.lose();
    const answered = state.answers.length;
    $app.innerHTML = `
    <div class="screen-anim result-wrap">
      <div class="result-stars"><span class="dim">★★★</span></div>
      <div class="result-title">愛心耗盡了！</div>
      <p class="result-sub">已答 ${answered} 題，答對 ${state.correct} 題。數學之塔的這一層還沒攻下——但別急，看懂解析再來一次。</p>
      <div class="btn-row">
        <button class="btn-ghost" id="goBack">回關卡列表</button>
        <button class="next-btn" id="goRevive">🧪 轉複習模式繼續</button>
        <button class="btn-ghost" id="goRetry">重新挑戰</button>
      </div>
    </div>`;
    document.getElementById('goBack').addEventListener('click', () => { sfx.click(); renderHome(); });
    document.getElementById('goRetry').addEventListener('click', () => { sfx.click(); retry(); });
    document.getElementById('goRevive').addEventListener('click', () => {
      sfx.click();
      state.reviveMode = true; state.hearts = 0;
      state.idx++;
      if (state.idx >= state.qs.length) renderResult(); else renderQuiz();
    });
  }

  function retry() {
    if (state.mode === 'mixed') startMixed();
    else startChapter(state.mode);
  }

  /* ── 結算 ── */
  function renderResult() {
    stopTimer();
    state.screen = 'result';
    const total = state.answers.length;
    const stars = starsFor(state.correct, total);
    const acc = total ? Math.round(state.correct / total * 100) : 0;
    if (state.mode !== 'mixed') {
      state.best[state.mode] = Math.max(state.best[state.mode] ?? -1, stars);
    }
    if (stars >= 2) sfx.win(); else sfx.lose();

    const titles = { 3: '完美通關！', 2: '順利過關！', 1: '驚險過關', 0: '尚未通關' };
    const review = state.answers.map((a, i) => `
      <div class="review-item ${a.ok ? 'ok' : 'no'}">
        <span class="r-icon">${a.ok ? '✓' : '✗'}</span>
        <span>第 ${i + 1} 題</span>
        <span class="r-topic">${topicOf(a.q.topic).name} · 難度 ${a.q.level}</span>
      </div>`).join('');

    $app.innerHTML = `
    <div class="screen-anim result-wrap">
      <div class="result-stars">${'<span>★</span>'.repeat(stars)}${'<span class="dim">★</span>'.repeat(3 - stars)}</div>
      <div class="result-title">${titles[stars]}</div>
      <p class="result-sub">${state.mode === 'mixed' ? '綜合挑戰' : topicOf(state.mode).name} — 答對率 ${acc}%</p>
      <div class="stat-row">
        <div class="stat-cell"><div class="num">${state.score}</div><div class="lbl">總分</div></div>
        <div class="stat-cell"><div class="num">${state.correct}/${total}</div><div class="lbl">答對題數</div></div>
        <div class="stat-cell"><div class="num">${acc}%</div><div class="lbl">正確率</div></div>
        <div class="stat-cell"><div class="num">x${state.maxCombo}</div><div class="lbl">最高連擊</div></div>
      </div>
      <div class="section-title">逐題回顧</div>
      <div class="review-list">${review}</div>
      <div class="btn-row">
        <button class="btn-ghost" id="rBack">回關卡列表</button>
        <button class="next-btn" id="rRetry">${stars >= 3 ? '再玩一次' : '重新挑戰拚 3 星'}</button>
      </div>
    </div>`;

    document.getElementById('rBack').addEventListener('click', () => { sfx.click(); renderHome(); });
    document.getElementById('rRetry').addEventListener('click', () => { sfx.click(); retry(); });
  }

  /* ── 事件 ── */
  $homeBtn.addEventListener('click', () => { sfx.click(); renderHome(); });

  renderHome();
})();
