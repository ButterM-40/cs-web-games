// Shared helpers: start/game-over screens, local high scores, booth idle reset,
// and game controller + keyboard menu navigation.
(function () {
  const KEY = "csArcade.scores.v1";
  const IDLE_MS = 90000;
  const TOP_N = 5;
  let pendingSave = null;
  let lastInput = Date.now();

  function loadAll() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }

  function saveAll(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { /* Scores just won't persist in this browser. */ }
  }

  function top(game) {
    return (loadAll()[game] || []).slice(0, TOP_N);
  }

  function addScore(game, name, score) {
    const data = loadAll();
    const id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    const list = data[game] || [];
    list.push({ id, name, score });
    list.sort((a, b) => b.score - a.score);
    data[game] = list.slice(0, 50);
    saveAll(data);
    return id;
  }

  function removeScore(game, id) {
    const data = loadAll();
    data[game] = (data[game] || []).filter((s) => s.id !== id);
    saveAll(data);
  }

  function clearScores() {
    saveAll({});
  }

  function el(tag, props, children) {
    const node = Object.assign(document.createElement(tag), props || {});
    (children || []).forEach((c) => node.append(c));
    return node;
  }

  function renderScores(listEl, game, myId) {
    listEl.replaceChildren();
    const scores = top(game);
    if (!scores.length) {
      listEl.append(el("li", { className: "empty", textContent: "No scores yet. Be the first!" }));
      return;
    }
    scores.forEach((s, i) => {
      const row = el("li", { className: s.id === myId ? "me" : "" }, [
        el("span", { textContent: i + 1 + ". " + s.name }),
        el("span", { textContent: s.score.toLocaleString() }),
      ]);
      row.dataset.id = s.id;
      listEl.append(row);
    });
  }

  function showOverlay(card) {
    const overlay = el("div", { className: "overlay" }, [card]);
    document.body.append(overlay);
    return overlay;
  }

  // Shows a "how to play" or between-rounds card. Pass `buttons` for several choices.
  function intro({ title, how, lesson, button, onStart, buttons }) {
    const choices = buttons || [{ label: button || "Start", primary: true, action: onStart }];
    const card = el("div", { className: "card" }, [el("h2", { textContent: title })]);
    const lines = (how || []).slice();
    const padHint = document.body.dataset.padHint;
    if (padHint && lines.length) lines.push(padHint);
    if (lines.length) card.append(el("ul", {}, lines.map((h) => el("li", { textContent: h }))));
    if (lesson) card.append(el("p", { className: "lesson", textContent: lesson }));
    const row = el("div", { className: "actions" });
    card.append(row);
    const overlay = showOverlay(card);
    choices.forEach((choice, i) => {
      const b = el("button", { className: choice.primary ? "primary" : "", textContent: choice.label });
      b.addEventListener("click", () => {
        overlay.remove();
        choice.action();
      });
      row.append(b);
      if (i === 0) b.focus();
    });
  }

  function over({ game, score, headline, lesson }) {
    const list = el("ol", { className: "scores" });
    const card = el("div", { className: "card" }, [
      el("h2", { textContent: headline || "Game over" }),
      el("div", { className: "final", textContent: score.toLocaleString() }),
    ]);
    if (lesson) card.append(el("p", { className: "lesson", textContent: lesson }));

    let myId = null;
    if (score > 0) {
      const input = el("input", { maxLength: 3, placeholder: "AAA", ariaLabel: "Your initials", autocomplete: "off" });
      const save = el("button", { className: "primary", textContent: "Save score" });
      const form = el("form", { className: "initials" }, [input, save]);
      const commit = (name) => {
        pendingSave = null;
        myId = addScore(game, name, score);
        form.remove();
        renderScores(list, game, myId);
      };
      pendingSave = () => commit("CS?");
      input.addEventListener("input", () => {
        input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      });
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        commit(input.value || "CS?");
      });
      card.append(form);
      card.append(el("p", { className: "pad-hint", textContent: "Controller: up/down picks a letter, right adds the next one, A saves." }));
      setTimeout(() => input.focus(), 50);
    }

    renderScores(list, game, myId);
    // Staff shortcut: Shift+click a score to remove an inappropriate name.
    list.addEventListener("click", (e) => {
      const row = e.target.closest("li[data-id]");
      if (!row || !e.shiftKey) return;
      removeScore(game, row.dataset.id);
      renderScores(list, game, myId);
    });
    card.append(el("h3", { textContent: "Top scores" }), list);

    const again = el("button", { textContent: "Play again" });
    again.addEventListener("click", () => {
      if (pendingSave) pendingSave();
      location.reload();
    });
    const back = el("button", { textContent: "All games" });
    back.addEventListener("click", goHome);
    card.append(el("div", { className: "actions" }, [again, back]));
    showOverlay(card);
  }

  function goHome() {
    if (pendingSave) pendingSave();
    location.href = "../index.html";
  }

  // Send abandoned games back to the launcher so the booth always looks ready.
  function watchIdle() {
    ["pointerdown", "keydown"].forEach((type) => {
      window.addEventListener(type, () => { lastInput = Date.now(); }, true);
    });
    setInterval(() => {
      if (Date.now() - lastInput > IDLE_MS) goHome();
    }, 2000);
  }

  // ---------- Menu navigation (arrow keys and controller D-pad) ----------
  // Action games (body.canvas-game) receive controller input as keyboard keys.
  // Everywhere else, and on any open card, arrows / D-pad move focus between
  // buttons and A / Enter presses the focused one.

  const isActionGame = () => document.body.classList.contains("canvas-game");
  const openOverlay = () => {
    const all = document.querySelectorAll(".overlay");
    return all.length ? all[all.length - 1] : null;
  };
  const menuMode = () => !!openOverlay() || !isActionGame();
  let lastRect = null;

  // Visually hidden checkboxes (launcher switches) use their label's box.
  function boxOf(n) {
    return n.type === "checkbox" && n.closest("label") ? n.closest("label") : n;
  }
  function rectOf(n) { return boxOf(n).getBoundingClientRect(); }
  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  function focusables() {
    const root = openOverlay() || document;
    const sel = 'button:not([disabled]), a[href], input:not([type="hidden"]), [tabindex]:not([tabindex="-1"])';
    return [...root.querySelectorAll(sel)].filter((n) => {
      if (n.closest("[hidden]")) return false;
      const r = rectOf(n);
      return r.width > 0 && r.height > 0;
    });
  }

  function nearest(list, r) {
    const c = center(r);
    let best = null, bestD = Infinity;
    for (const n of list) {
      const p = center(rectOf(n));
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  function focusNode(n) {
    if (!n) return;
    n.focus({ preventScroll: true, focusVisible: true });
    boxOf(n).scrollIntoView({ block: "nearest", inline: "nearest" });
    lastRect = rectOf(n);
  }

  // If focus was lost (the page re-drew its buttons), put it back near where it was.
  function ensureFocus() {
    const list = focusables();
    if (!list.length) return null;
    if (list.includes(document.activeElement)) return document.activeElement;
    const n = lastRect ? nearest(list, lastRect) : list[0];
    focusNode(n);
    return n;
  }

  // dir: 0 up, 1 right, 2 down, 3 left
  function move(dir) {
    const list = focusables();
    if (!list.length) return;
    const cur = document.activeElement;
    if (!list.includes(cur)) { ensureFocus(); return; }
    const a = center(rectOf(cur));
    let best = null, bestScore = Infinity;
    for (const n of list) {
      if (n === cur) continue;
      const b = center(rectOf(n));
      const dx = b.x - a.x, dy = b.y - a.y;
      const main = [-dy, dx, dy, -dx][dir];
      const side = dir % 2 ? Math.abs(dy) : Math.abs(dx);
      if (main <= 4) continue;
      const score = main + side * 2.5;
      if (score < bestScore) { bestScore = score; best = n; }
    }
    if (best) focusNode(best);
  }

  function activate() {
    const n = ensureFocus();
    if (!n) return;
    if (n.matches(".initials input")) { n.form.requestSubmit(); return; }
    lastRect = rectOf(n);
    n.click();
  }

  // Arcade-style initials entry for controllers.
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  function initialsPad(input, dir) {
    let v = input.value;
    if (dir === 0 || dir === 2) {
      if (!v) v = "A";
      else {
        const i = Math.max(0, LETTERS.indexOf(v.slice(-1)));
        v = v.slice(0, -1) + LETTERS[(i + (dir === 0 ? 1 : LETTERS.length - 1)) % LETTERS.length];
      }
    } else if (dir === 1) {
      if (v.length >= 3) { move(1); return; }
      v += "A";
    } else {
      v = v.slice(0, -1);
    }
    input.value = v;
  }

  window.addEventListener("keydown", (e) => {
    if (!e.isTrusted) return; // controller keys are handled by the poll loop below
    const dir = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }[e.key];
    if (dir === undefined || !menuMode()) return;
    if (e.target instanceof Element && e.target.matches("input:not([type=checkbox])")) return;
    e.preventDefault();
    move(dir);
  });
  document.addEventListener("focusin", (e) => {
    if (e.target instanceof Element) lastRect = rectOf(e.target);
  });

  // ---------- Game controllers ----------
  // In action games, controller 1 = W A S D and controller 2 = arrow keys;
  // A, RB or RT = space. View/Back returns to the launcher on every page.
  const PAD_KEYS = [
    ["w", "d", "s", "a"],
    ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"],
  ];
  const pads = {};
  const held = new Map(); // synthetic key -> how many controllers hold it

  function sendKey(type, key) {
    document.body.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
  }
  function press(key) {
    const n = held.get(key) || 0;
    held.set(key, n + 1);
    if (!n) sendKey("keydown", key);
  }
  function release(key) {
    const n = held.get(key) || 0;
    if (n > 1) { held.set(key, n - 1); return; }
    held.delete(key);
    if (n) sendKey("keyup", key);
  }
  function releaseAll() {
    for (const key of held.keys()) sendKey("keyup", key);
    held.clear();
    for (const id in pads) pads[id].game = [];
  }

  function readPad(gp) {
    const b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    return {
      dirs: [b(12) || ay < -0.5, b(15) || ax > 0.5, b(13) || ay > 0.5, b(14) || ax < -0.5],
      a: b(0),
      action: b(0) || b(5) || b(7),
      back: b(8),
    };
  }

  let wasMenu = true;
  function pollPads() {
    requestAnimationFrame(pollPads);
    const list = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (!list.length) return;
    const menu = menuMode();
    if (menu && !wasMenu) releaseAll();
    wasMenu = menu;

    list.forEach((gp, slot) => {
      const now = readPad(gp);
      let st = pads[gp.index];
      if (!st) {
        // Treat buttons already down on page load (the press that opened it) as old.
        pads[gp.index] = { prev: now, repeatAt: [0, 0, 0, 0], game: [], blockAction: now.action };
        return;
      }
      const prev = st.prev;
      st.prev = now;
      if (now.action || now.back || now.dirs.some(Boolean)) lastInput = Date.now();
      if (now.back && !prev.back) { goHome(); return; }

      if (menu) {
        const t = performance.now();
        const a = document.activeElement;
        const input = a && a.matches && a.matches(".initials input") ? a : null;
        now.dirs.forEach((on, dir) => {
          if (!on) return;
          const first = !prev.dirs[dir];
          if (!first && t < st.repeatAt[dir]) return;
          st.repeatAt[dir] = t + (first ? 380 : 140);
          if (input) initialsPad(input, dir);
          else move(dir);
        });
        if (now.a && !prev.a) { activate(); st.blockAction = true; }
        return;
      }

      // Action game: hold the matching keys while the controller holds them.
      const keys = PAD_KEYS[slot];
      if (!keys) return;
      const want = keys.filter((k, dir) => now.dirs[dir]);
      // The A press that closed a card doesn't also fire/jump until it's let go.
      if (!now.action) st.blockAction = false;
      if (now.action && !st.blockAction) want.push(" ");
      st.game.filter((k) => !want.includes(k)).forEach(release);
      want.filter((k) => !st.game.includes(k)).forEach(press);
      st.game = want;
    });
  }

  requestAnimationFrame(pollPads);

  function shuffle(items) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Sizes a canvas to its box at device resolution; returns CSS-pixel width and height.
  function fitCanvas(canvas, ctx) {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: r.width, h: r.height };
  }

  window.Arcade = { intro, over, top, renderScores, removeScore, clearScores, watchIdle, shuffle, el, fitCanvas, home: goHome };
})();
