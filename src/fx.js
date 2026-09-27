import Phaser from 'phaser';
import { params } from './util.js';

// CRT look: per-world-pixel scanlines, slight RGB split, vignette. Glues the mismatched
// asset packs together and sells the terminal vibe. The scanline ripple averages 1.0, so it
// adds texture without dimming the screen.
const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
varying vec2 outTexCoord;
void main() {
  vec2 uv = outTexCoord;
  float ab = 0.5 / uResolution.x;
  vec3 col = vec3(
    texture2D(uMainSampler, uv + vec2(ab, 0.0)).r,
    texture2D(uMainSampler, uv).g,
    texture2D(uMainSampler, uv - vec2(ab, 0.0)).b
  );
  col *= 1.0 + 0.06 * sin(uv.y * uResolution.y * 2.0943951);
  vec2 d = uv - 0.5;
  col *= 1.0 - dot(d, d) * 0.4;
  gl_FragColor = vec4(col, 1.0);
}`;

export class CRTPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, name: 'CRTPipeline', fragShader: FRAG });
  }

  onPreRender() {
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
  }
}

// ?fx=off skips screen FX, for A/B checks against the raw art.
const FX_OFF = params.get('fx') === 'off';

// No bloom: Phaser's BloomFX composites as mix(frame, blur * strength, 0.5), not additively,
// so it halves the frame before adding glow. At (blur 0.6, strength 0.3) it rendered the world
// at 58% brightness, which read as the play area sitting at half opacity under the HUD.
export function applyScreenFX(cam) {
  if (FX_OFF || cam.scene.game.renderer.type !== Phaser.WEBGL) return;
  cam.setPostPipeline(CRTPipeline);
}

// Make gameplay sprites (player, enemies, heads) pop against the busy neon background:
// more saturated, a touch more contrast. WebGL only; no-op on canvas.
export function pop(sprite) {
  if (!sprite.preFX || sprite.scene.game.renderer.type !== Phaser.WEBGL) return;
  const cm = sprite.preFX.addColorMatrix();
  cm.saturate(0.25);
  cm.contrast(0.12, true);
}
