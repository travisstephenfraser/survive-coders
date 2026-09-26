import Phaser from 'phaser';

// CRT look: per-world-pixel scanlines, slight RGB split, vignette. Glues the mismatched
// asset packs together and sells the terminal vibe.
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
  float line = 0.5 + 0.5 * sin(uv.y * uResolution.y * 2.0943951);
  col *= 0.88 + 0.12 * line;
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

export function applyScreenFX(cam, { bloom = false } = {}) {
  if (cam.scene.game.renderer.type !== Phaser.WEBGL) return;
  if (bloom) cam.postFX.addBloom(0xffffff, 1, 1, 0.6, 0.3, 4);
  cam.setPostPipeline(CRTPipeline);
}

// Make gameplay sprites (player, enemies, heads) pop against the busy neon background:
// brighter, more saturated, a touch more contrast. WebGL only; no-op on canvas.
export function pop(sprite, brightness = 1.2) {
  if (!sprite.preFX || sprite.scene.game.renderer.type !== Phaser.WEBGL) return;
  const cm = sprite.preFX.addColorMatrix();
  cm.brightness(brightness);
  cm.saturate(0.25, true);
  cm.contrast(0.12, true);
}
