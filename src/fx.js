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
  float ab = 0.9 / uResolution.x;
  vec3 col = vec3(
    texture2D(uMainSampler, uv + vec2(ab, 0.0)).r,
    texture2D(uMainSampler, uv).g,
    texture2D(uMainSampler, uv - vec2(ab, 0.0)).b
  );
  float line = 0.5 + 0.5 * sin(uv.y * uResolution.y * 2.0943951);
  col *= 0.82 + 0.18 * line;
  vec2 d = uv - 0.5;
  col *= 1.0 - dot(d, d) * 0.55;
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
  if (bloom) cam.postFX.addBloom(0xffffff, 1, 1, 0.8, 0.45, 4);
  cam.setPostPipeline(CRTPipeline);
}
