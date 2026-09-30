import { createFont, runCard } from '../shared/pixelCard.js';
import { encodeRun, shareLine } from '../shared/share.js';

// Sharing a run from the End screen: the card as a PNG (drawn here, with the same code as the
// server's link previews), its link, and the one-liner. On a phone the share sheet gets the
// image and the line, so it goes out as an image post with the link in its text (LinkedIn
// shrinks and down-ranks link previews; an image post with the link in it keeps its reach). On a
// desktop the line goes to the clipboard and the card can be saved.
//
// navigator.share and the clipboard only work inside a user gesture, and Safari counts an
// `await` as leaving it: so the card is drawn ahead of time (prepare) and share() starts
// synchronously in the click or key handler.

let font = null;

// The font from the texture Boot already loaded (font8_src, the unwhitened sheet).
function gameFont(scene) {
  if (font) return font;
  const img = scene.textures.get('font8_src').getSourceImage();
  const c = document.createElement('canvas');
  [c.width, c.height] = [img.width, img.height];
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data, width } = ctx.getImageData(0, 0, img.width, img.height);
  font = createFont({ alpha: (x, y) => data[(y * width + x) * 4 + 3] });
  return font;
}

// `run`: { placeKey, stars, timeMs } plus { name, rank, total } for a posted win.
// → a File (PNG), or null if the browser can't make one.
export async function drawCard(scene, run) {
  try {
    const r = runCard(gameFont(scene), run);
    const c = document.createElement('canvas');
    [c.width, c.height] = [r.width, r.height];
    c.getContext('2d').putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
    return blob ? new File([blob], 'survive-coders-run.png', { type: 'image/png' }) : null;
  } catch {
    return null;
  }
}

// A posted win links to its signed record (/r/<token>, from the leaderboard's answer); anything
// else to the stateless /s/<code>.
export function runLink(run, token = null) {
  return token ? `${location.origin}/r/${token}` : `${location.origin}/s/${encodeRun(run)}`;
}

export const runLine = (run, url) => shareLine({ ...run, posted: Number.isInteger(run.rank) }, url);

// → Promise of 'shared' | 'cancelled' | 'copied' | 'manual' (nothing worked: show the line to
// copy by hand, as inside an iframe that wasn't granted web-share or clipboard-write).
export function shareRun({ text, file, touch }) {
  if (touch && navigator.share) {
    const withFile = Boolean(file && navigator.canShare?.({ files: [file] }));
    return navigator.share(withFile ? { files: [file], text } : { text }).then(
      () => 'shared',
      (e) => (e?.name === 'AbortError' ? 'cancelled' : copyText(text)),
    );
  }
  return copyText(text);
}

export function copyText(text) {
  if (!navigator.clipboard?.writeText) return Promise.resolve('manual');
  return navigator.clipboard.writeText(text).then(
    () => 'copied',
    () => 'manual',
  );
}

export function saveFile(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
