import { PLATFORMS, checkLink, checkName, parseProfile } from '../shared/leaderboard.js';

// The win screen's leaderboard form: a real HTML form over the canvas (Phaser's DOM container
// keeps it scaled with the game), so phones get their keyboard and a profile URL can be pasted.
//
// Every key, mouse and touch event stops at the form. Phaser, the voice keys and the End
// scene all listen on window: a keystroke that got there would fire a power, start a run
// (ENTER, T), or be swallowed by the keys Phaser captures for play (W A D Z X J, space).
//
// `submit(profile)` posts and resolves to the API result; `view(board)` opens the leaderboard;
// `share(r)`, after a post, shares the posted run (called inside the click, a user gesture).

const CSS = `
.sc-form { box-sizing: border-box; width: 380px; padding: 10px 14px; background: #0d0d0d; border: 2px solid #d97757;
  font: 14px/1.35 Menlo, Consolas, monospace; color: #f5f5f5; }
.sc-form * { box-sizing: border-box; font: inherit; }
.sc-form p { margin: 0 0 8px; }
.sc-form .sc-head { display: flex; justify-content: space-between; align-items: baseline; color: #8b8b8b; }
.sc-form label { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; color: #8b8b8b; }
.sc-form label > span { width: 58px; flex: none; }
.sc-form input, .sc-form select { min-width: 0; padding: 3px 6px; background: #161b22; color: #f5f5f5;
  border: 1px solid #444c56; border-radius: 0; font-size: 16px; -webkit-user-select: text; user-select: text; touch-action: manipulation; }
.sc-form input { flex: 1; }
.sc-form select { flex: none; width: 104px; }
.sc-form input:focus, .sc-form select:focus, .sc-form button:focus-visible { outline: 2px solid #3fb950; outline-offset: 0; }
.sc-form .sc-row { display: flex; align-items: center; gap: 8px; }
.sc-form button { padding: 3px 12px; background: #21262d; color: #f5f5f5; border: 2px solid #444c56; cursor: pointer; touch-action: manipulation; }
.sc-form button.sc-go { border-color: #3fb950; color: #3fb950; }
.sc-form button:disabled { opacity: 0.5; cursor: default; }
.sc-form .sc-status { min-height: 1.35em; margin: 8px 0 0; color: #e3b341; }
.sc-form .sc-hint { color: #8b8b8b; font-size: 12px; }
`;

export function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const REASON = {
  name: 'name: 1-16 letters, digits or symbols (plain ASCII)',
  link: "that profile handle doesn't look right",
  'rude-name': 'profanity? elon is that you?',
  'rude-link': 'profanity? elon is that you?',
  stars: 'the server refused this run (stars)',
  time: 'the server refused this run (time)',
  splits: 'the server refused this run (splits)',
  id: 'the server refused this run (id)',
};

export function ensureFormCss() {
  if (!document.getElementById('sc-form-css')) document.head.append(el('style', { id: 'sc-form-css', textContent: CSS }));
}

// Keys, clicks and taps stop at a panel over the canvas (see the note at the top).
export function isolate(node) {
  for (const type of ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'pointerdown', 'pointerup']) {
    node.addEventListener(type, (e) => e.stopPropagation());
  }
}

// What sharing reports back (src/share.js shareRun).
export const SHARED = { shared: 'shared ✓', copied: 'copied ✓: paste it anywhere', manual: "couldn't share: copy the line below by hand", cancelled: null };

export function scoreForm({ profile, touch, submit, view, close, share }) {
  ensureFormCss();

  const name = el('input', { name: 'name', value: profile.name, maxLength: 16, autocomplete: 'off', autocapitalize: 'off', spellcheck: false, enterKeyHint: 'send', placeholder: 'your name' });
  const platform = el(
    'select',
    { name: 'platform' },
    el('option', { value: '', textContent: 'no link' }),
    ...Object.entries(PLATFORMS).map(([value, p]) => el('option', { value, textContent: p.label })),
  );
  platform.value = profile.platform ?? '';
  const handle = el('input', { name: 'handle', value: profile.handle ?? '', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'handle or URL' });
  const go = el('button', { type: 'submit', className: 'sc-go', textContent: 'post' });
  const skip = el('button', { type: 'button', textContent: 'skip' });
  const status = el('p', { className: 'sc-status' });
  status.setAttribute('aria-live', 'polite');
  const hint = el('span', { className: 'sc-hint', textContent: touch ? '' : 'ENTER post · ESC skip' });
  const buttons = el('div', { className: 'sc-row' }, go, skip);
  const form = el(
    'form',
    { className: 'sc-form', noValidate: true },
    el('p', { className: 'sc-head' }, el('span', { textContent: '$ git push --board' }), hint),
    el('label', {}, el('span', { textContent: 'name' }), name),
    el('label', {}, el('span', { textContent: 'link' }), platform, handle),
    buttons,
    status,
  );

  isolate(form);
  // The font only draws printable ASCII, so that's all a name can hold.
  name.addEventListener('input', () => {
    const clean = name.value.replace(/[^ -~]/g, '').replace(/^ +/, '');
    if (clean !== name.value) name.value = clean;
  });
  // A pasted profile URL (or an @handle) picks its platform and keeps just the handle.
  const tidyHandle = () => {
    const parsed = parseProfile(handle.value);
    if (!parsed) return;
    if (parsed.platform) platform.value = parsed.platform;
    handle.value = parsed.handle;
  };
  handle.addEventListener('paste', () => setTimeout(tidyHandle));
  handle.addEventListener('change', tidyHandle);
  // The phone keyboard can leave the page scrolled when it closes.
  form.addEventListener('focusout', () => setTimeout(() => form.contains(document.activeElement) || window.scrollTo(0, 0)));
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  skip.addEventListener('click', close);

  let busyUntil = 0;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (go.disabled) return;
    tidyHandle();
    const entry = { name: name.value.trim(), platform: platform.value || null, handle: handle.value.trim() || null };
    if (!entry.platform) entry.handle = null;
    if (entry.platform && !entry.handle) entry.platform = null;
    const problem = checkName(entry.name) ?? checkLink(entry.platform, entry.handle);
    if (problem) {
      status.textContent = problem === 'link' ? `that doesn't look like a ${PLATFORMS[entry.platform].label} handle` : REASON.name;
      (problem === 'link' ? handle : name).focus();
      return;
    }
    if (Date.now() < busyUntil) return;
    go.disabled = skip.disabled = true;
    status.textContent = 'pushing to the board..._';
    const r = await submit(entry);
    go.disabled = skip.disabled = false;
    if (r.state === 'ok') return done(r);
    if (r.state === 'offline') status.textContent = "can't reach the leaderboard: try again";
    else if (r.status === 409) status.textContent = 'this run is already on the board';
    else if (r.status === 429) {
      status.textContent = 'busy: try again in a minute';
      busyUntil = Date.now() + 60000;
    } else if (r.status === 422) {
      status.textContent = REASON[r.error] ?? 'the server refused this run';
      if (r.error === 'rude-name') name.focus();
      if (r.error === 'rude-link') handle.focus();
    }
    else status.textContent = `leaderboard unavailable (HTTP ${r.status}): try again`;
  });

  // Posted: the ranks on both boards, a way to the board, and the keys back to the game.
  function done(r) {
    const { rank, total, best, fastest } = r.you;
    const mark = (b) => (b ? ' ✓' : '');
    if (rank === null) {
      status.textContent = 'posted ✓'; // the answer's ranks didn't add up: say only what's sure
    } else if (fastest) {
      const ranks = `time #${fastest.rank}${mark(fastest.best)} · ★ #${rank}${mark(best)} of ${total}`;
      status.textContent = best || fastest.best ? `${ranks} (✓ personal best)` : `your bests stand: ${ranks}`;
    } else {
      // An older API's answer: the stars rank alone.
      status.textContent = best ? `★ #${rank} of ${total} ✓ personal best` : `your ★ best is still #${rank} of ${total}`;
    }
    const board = el('button', { type: 'button', className: 'sc-go', textContent: 'view the board' });
    board.addEventListener('click', () => view(r.board));
    const shut = el('button', { type: 'button', textContent: 'close' });
    shut.addEventListener('click', close);
    const shareBtn = el('button', { type: 'button', className: 'sc-go', textContent: touch ? 'share' : 'copy link' });
    shareBtn.addEventListener('click', async () => {
      status.textContent = SHARED[await share(r)] ?? status.textContent;
    });
    buttons.replaceChildren(shareBtn, board, shut);
    for (const input of [name, platform, handle]) input.disabled = true;
    hint.textContent = touch ? '' : 'ESC close';
    board.focus();
  }

  return {
    root: form,
    focus: () => name.focus(),
  };
}
