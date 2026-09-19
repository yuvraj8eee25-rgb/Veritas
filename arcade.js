/* =========================================================
   VERITAS — Arcade Layer
   ---------------------------------------------------------
   Session-depth systems that sit alongside app.js:
     · Combo chains        — stakes inside a single run
     · Juice               — pops, shake, confetti, auto-advance
     · Daily quests        — reasons to play a 2nd and 3rd round
     · Achievements        — long-horizon goals to chase

   Loaded BEFORE app.js. Exposes window.Arcade. app.js calls
   into it at seven points; it never reaches into app.js.
   ========================================================= */

window.Arcade = (function () {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = id => document.getElementById(id);

  /* -------------------------------------------------------
     1. COMBO
     Consecutive correct answers raise a multiplier. It decays
     to nothing on a single miss, which is what makes each
     question feel like it's worth something.
     ------------------------------------------------------- */

  const TIERS = [
    { at: 8, mult: 3,   label: "UNSTOPPABLE" },
    { at: 6, mult: 2.5, label: "ON FIRE" },
    { at: 4, mult: 2,   label: "ROLLING" },
    { at: 2, mult: 1.5, label: "CHAIN" }
  ];

  const combo = {
    count: 0,
    best: 0,

    tier() {
      return TIERS.find(t => this.count >= t.at) || { mult: 1, label: "" };
    },

    hit() {
      this.count += 1;
      this.best = Math.max(this.best, this.count);
      this.render(true);
      return this.tier().mult;
    },

    miss() {
      const had = this.count;
      this.count = 0;
      this.render(false);
      if (had >= 2) {
        const el = $("combo-hud");
        if (el && !reduced) {
          el.classList.remove("break");
          void el.offsetWidth;
          el.classList.add("break");
        }
      }
    },

    reset() {
      this.count = 0;
      this.best = 0;
      this.render(false);
    },

    render(bumped) {
      const el = $("combo-hud");
      if (!el) return;
      const t = this.tier();
      el.classList.toggle("live", this.count >= 2);
      el.dataset.tier = String(t.mult);
      $("combo-count").textContent = this.count;
      $("combo-mult").textContent = t.mult === 1 ? "" : t.mult + "×";
      $("combo-label").textContent = t.label;
      if (bumped && !reduced) {
        el.classList.remove("bump");
        void el.offsetWidth;
        el.classList.add("bump");
      }
    }
  };

  /* -------------------------------------------------------
     2. JUICE
     ------------------------------------------------------- */

  function pop(anchor, text, kind) {
    if (!anchor || reduced) return;
    const r = anchor.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = "juice-pop " + (kind || "");
    el.textContent = text;
    el.style.left = (r.left + r.width / 2) + "px";
    el.style.top = (r.top + r.height / 2) + "px";
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 1000);
  }

  function shake(el) {
    if (!el || reduced) return;
    el.classList.remove("juice-shake");
    void el.offsetWidth;
    el.classList.add("juice-shake");
  }

  function confetti(count) {
    if (reduced) return;
    const canvas = document.createElement("canvas");
    canvas.className = "juice-confetti";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const colors = ["#7c5cfc", "#4318ff", "#39b8ff", "#01b574", "#ffb547"];
    const n = count || 90;
    const bits = [];
    for (let i = 0; i < n; i++) {
      bits.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 220,
        y: canvas.height * 0.36,
        vx: (Math.random() - 0.5) * 11,
        vy: Math.random() * -13 - 3,
        w: 5 + Math.random() * 6,
        h: 3 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        c: colors[(Math.random() * colors.length) | 0]
      });
    }
    let frames = 0;
    (function step() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      bits.forEach(b => {
        b.vy += 0.42;
        b.x += b.vx;
        b.y += b.vy;
        b.rot += b.vr;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.c;
        ctx.globalAlpha = Math.max(0, 1 - frames / 110);
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      });
      frames += 1;
      if (frames < 115) requestAnimationFrame(step);
      else canvas.remove();
    })();
  }

  /* Auto-advance: the feedback panel reads itself out over a few
     seconds and moves on, so a run keeps its rhythm. Pointer or
     keyboard contact with the panel cancels it — nobody gets
     yanked away from an explanation they're still reading. */
  function autoAdvance(btn, panel, ms) {
    if (!btn) return;
    cancelAdvance();
    btn.classList.add("auto-advancing");
    btn.style.setProperty("--advance-dur", ms + "ms");

    const stop = () => cancelAdvance();
    panel && panel.addEventListener("pointerdown", stop, { once: true });
    panel && panel.addEventListener("pointermove", stop, { once: true });
    window.addEventListener("keydown", stop, { once: true });

    autoAdvance._timer = window.setTimeout(() => {
      btn.classList.remove("auto-advancing");
      btn.click();
    }, ms);
    autoAdvance._cleanup = () => {
      panel && panel.removeEventListener("pointerdown", stop);
      panel && panel.removeEventListener("pointermove", stop);
      window.removeEventListener("keydown", stop);
      btn.classList.remove("auto-advancing");
    };
  }

  function cancelAdvance() {
    if (autoAdvance._timer) window.clearTimeout(autoAdvance._timer);
    autoAdvance._timer = null;
    if (autoAdvance._cleanup) autoAdvance._cleanup();
    autoAdvance._cleanup = null;
  }

  /* -------------------------------------------------------
     3. DAILY QUESTS
     Three goals a day, drawn from a pool and seeded by the
     date so everyone gets the same set. Most are completable
     in one sitting but not one run — that's the point.
     ------------------------------------------------------- */

  const QUEST_POOL = [
    { id: "runs3",    goal: 3,   xp: 60,  text: "Finish 3 training runs",        track: r => 1 },
    { id: "correct15",goal: 15,  xp: 70,  text: "Answer 15 questions correctly", track: r => r.correct },
    { id: "chain5",   goal: 5,   xp: 50,  text: "Build a 5-answer chain",        track: r => r.bestCombo, best: true },
    { id: "acc80",    goal: 1,   xp: 60,  text: "Finish a run at 80% or better", track: r => (r.accuracy >= 80 ? 1 : 0) },
    { id: "modes2",   goal: 2,   xp: 50,  text: "Play 2 different modes",        track: null },
    { id: "flawless", goal: 1,   xp: 100, text: "Finish a run with no mistakes", track: r => (r.accuracy === 100 ? 1 : 0) },
    { id: "daily",    goal: 1,   xp: 80,  text: "Clear the Daily Challenge",     track: r => (r.isDaily ? 1 : 0) },
    { id: "score200", goal: 200, xp: 60,  text: "Score 200 in a single run",     track: r => r.score, best: true }
  ];

  function seedFrom(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function todaysQuests(dateStr) {
    let s = seedFrom(dateStr);
    const pool = QUEST_POOL.slice();
    const picked = [];
    while (picked.length < 3 && pool.length) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      picked.push(pool.splice(s % pool.length, 1)[0]);
    }
    return picked;
  }

  const quests = {
    ensure(state, dateStr) {
      if (!state.quests || state.quests.date !== dateStr) {
        state.quests = { date: dateStr, prog: {}, done: [], modes: [] };
      }
      return state.quests;
    },

    /* Returns the quests completed by this run, so the caller can
       celebrate them. Awards XP directly into state. */
    report(state, dateStr, run) {
      const q = this.ensure(state, dateStr);
      if (run.modeKey && q.modes.indexOf(run.modeKey) === -1) q.modes.push(run.modeKey);

      const completed = [];
      todaysQuests(dateStr).forEach(def => {
        if (q.done.indexOf(def.id) !== -1) return;
        const prev = q.prog[def.id] || 0;
        let next;
        if (def.id === "modes2") next = q.modes.length;
        else if (def.best) next = Math.max(prev, def.track(run));
        else next = prev + def.track(run);
        q.prog[def.id] = next;
        if (next >= def.goal) {
          q.done.push(def.id);
          state.totalXp += def.xp;
          completed.push(def);
        }
      });
      return completed;
    },

    render(container, state, dateStr) {
      if (!container) return;
      const q = this.ensure(state, dateStr);
      const defs = todaysQuests(dateStr);
      const doneCount = defs.filter(d => q.done.indexOf(d.id) !== -1).length;

      container.innerHTML = `
        <div class="quest-card glass-card">
          <div class="quest-head">
            <h2 class="section-heading">Today's goals</h2>
            <span class="quest-tally">${doneCount}/3</span>
          </div>
          <div class="quest-rows">
            ${defs.map(d => {
              const prog = Math.min(q.prog[d.id] || 0, d.goal);
              const done = q.done.indexOf(d.id) !== -1;
              return `
              <div class="quest-row${done ? " done" : ""}">
                <span class="quest-tick">${done ? "✓" : ""}</span>
                <div class="quest-body">
                  <span class="quest-text">${d.text}</span>
                  <div class="quest-bar"><div class="quest-bar-fill" style="width:${(prog / d.goal) * 100}%"></div></div>
                </div>
                <span class="quest-xp">+${d.xp}</span>
              </div>`;
            }).join("")}
          </div>
          ${achievements.strip(state)}
        </div>`;

      const toggle = container.querySelector(".ach-toggle");
      if (toggle) {
        toggle.addEventListener("click", () => {
          container.querySelector(".ach-grid").classList.toggle("open");
          toggle.classList.toggle("open");
        });
      }
    }
  };

  /* -------------------------------------------------------
     4. ACHIEVEMENTS
     ------------------------------------------------------- */

  const ACHIEVEMENTS = [
    { id: "first",     icon: "◆", name: "First Blood",     desc: "Finish your first run",            test: s => s.totalRuns >= 1 },
    { id: "runs10",    icon: "◇", name: "Regular",         desc: "Finish 10 runs",                   test: s => s.totalRuns >= 10 },
    { id: "runs50",    icon: "◈", name: "Veteran",         desc: "Finish 50 runs",                   test: s => s.totalRuns >= 50 },
    { id: "flawless",  icon: "✦", name: "Flawless",        desc: "Finish a run with no mistakes",    test: (s, r) => r && r.accuracy === 100 },
    { id: "chain10",   icon: "⚡", name: "Ten in a Row",    desc: "Build a 10-answer chain",          test: s => (s.bestCombo || 0) >= 10 },
    { id: "chain20",   icon: "☄", name: "Twenty Straight", desc: "Build a 20-answer chain",          test: s => (s.bestCombo || 0) >= 20 },
    { id: "xp1k",      icon: "▲", name: "Four Figures",    desc: "Bank 1,000 XP",                    test: s => s.totalXp >= 1000 },
    { id: "xp5k",      icon: "▴", name: "Five Thousand",   desc: "Bank 5,000 XP",                    test: s => s.totalXp >= 5000 },
    { id: "streak3",   icon: "●", name: "Three Days",      desc: "Play 3 days running",              test: s => s.streak >= 3 },
    { id: "streak7",   icon: "◉", name: "Full Week",       desc: "Play 7 days running",              test: s => s.streak >= 7 },
    { id: "streak30",  icon: "◎", name: "A Month of It",   desc: "Play 30 days running",             test: s => s.streak >= 30 },
    { id: "allmodes",  icon: "❖", name: "All-Rounder",     desc: "Play every training mode",         test: s => Object.keys(s.modeStats || {}).length >= 4 },
    { id: "quests1",   icon: "✓", name: "Goal-Getter",     desc: "Clear all 3 goals in a day",       test: s => s.quests && s.quests.done.length >= 3 },
    { id: "score300",  icon: "★", name: "High Score",      desc: "Score 300 in a single run",        test: (s, r) => r && r.score >= 300 }
  ];

  const achievements = {
    check(state, run) {
      if (!state.achievements) state.achievements = [];
      const fresh = [];
      ACHIEVEMENTS.forEach(a => {
        if (state.achievements.indexOf(a.id) !== -1) return;
        let ok = false;
        try { ok = !!a.test(state, run); } catch (e) { ok = false; }
        if (ok) {
          state.achievements.push(a.id);
          fresh.push(a);
        }
      });
      return fresh;
    },

    strip(state) {
      const have = state.achievements || [];
      return `
        <button type="button" class="ach-toggle">
          <span>Achievements</span>
          <span class="ach-tally">${have.length} of ${ACHIEVEMENTS.length}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="ach-grid">
          ${ACHIEVEMENTS.map(a => {
            const got = have.indexOf(a.id) !== -1;
            return `<div class="ach${got ? " got" : ""}" title="${a.name} — ${a.desc}">
                      <span class="ach-icon">${got ? a.icon : "?"}</span>
                      <span class="ach-name">${got ? a.name : "Locked"}</span>
                      <span class="ach-desc">${a.desc}</span>
                    </div>`;
          }).join("")}
        </div>`;
    }
  };

  /* -------------------------------------------------------
     5. CELEBRATION QUEUE
     Unlocks and quest completions arrive together at the end
     of a run. Staggering them keeps each one legible instead
     of stacking four toasts on one frame.
     ------------------------------------------------------- */

  function celebrate(items) {
    items.forEach((it, i) => {
      window.setTimeout(() => {
        if (window.DA && window.DA.toast) window.DA.toast(it);
      }, 700 + i * 1100);
    });
  }

  return {
    combo: combo,
    quests: quests,
    achievements: achievements,
    pop: pop,
    shake: shake,
    confetti: confetti,
    autoAdvance: autoAdvance,
    cancelAdvance: cancelAdvance,
    celebrate: celebrate,
    reduced: reduced
  };
})();
