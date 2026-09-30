import { SHARED, el, ensureFormCss, isolate } from './scoreForm.js';
import { saveFile, shareRun } from './share.js';

// The End screen's share panel, a DOM panel like the leaderboard form (same look, same event
// isolation, so a tap on it doesn't retry the level). A phone gets one button, the share sheet
// with the card; a desktop gets "copy link" (the one-liner, link included) and "save card".
// If neither works, the line shows in a box to copy by hand.
//
// `get()` → { text, file } for the run right now (the file may still be null while the card is
// being drawn; the share then goes out as text).

export function sharePanel({ touch, get }) {
  ensureFormCss();
  const status = el('p', { className: 'sc-status' });
  status.setAttribute('aria-live', 'polite');
  const manual = el('input', { readOnly: true, className: 'sc-line', hidden: true });
  const go = el('button', { type: 'button', className: 'sc-go', textContent: touch ? 'share this run' : 'copy link' });
  const save = el('button', { type: 'button', textContent: 'save card' });
  const buttons = el('div', { className: 'sc-row' }, go, ...(touch ? [] : [save]));
  const root = el(
    'form',
    { className: 'sc-form', noValidate: true },
    el('p', { className: 'sc-head' }, el('span', { textContent: '$ share --run' }), el('span', { className: 'sc-hint', textContent: touch ? '' : 'S share' })),
    buttons,
    manual,
    status,
  );
  manual.style.cssText = 'width: 100%; margin-top: 8px;';
  isolate(root);

  function showManual(text) {
    manual.value = text;
    manual.hidden = false;
    manual.focus();
    manual.select();
  }

  // Starts synchronously: call it straight from a click or key handler.
  function share() {
    const { text, file } = get();
    return shareRun({ text, file, touch }).then((result) => {
      if (result === 'manual') showManual(text);
      if (SHARED[result]) status.textContent = SHARED[result];
      return result;
    });
  }

  root.addEventListener('submit', (e) => e.preventDefault());
  go.addEventListener('click', share);
  save.addEventListener('click', () => {
    const { file } = get();
    if (file) {
      saveFile(file);
      status.textContent = 'card saved ✓: attach it to a post';
    } else status.textContent = 'drawing the card..._';
  });

  return { root, share, showManual };
}
