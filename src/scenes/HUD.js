import Phaser from 'phaser';
import { POWERS, voice } from '../voice.js';
import { MAX_HP, uiText } from '../util.js';

// Screen-space overlay at 1x zoom so text stays crisp.
export default class HUD extends Phaser.Scene {
  constructor() {
    super('HUD');
  }

  create() {
    this.hearts = [];
    for (let i = 0; i < MAX_HP; i++) this.hearts.push(this.add.image(20 + i * 28, 20, 'heart').setOrigin(0).setScale(3));
    // GitHub-style "★ Star | 42" badge.
    this.add.rectangle(944, 14, 190, 38, 0x21262d).setOrigin(1, 0).setStrokeStyle(2, 0x444c56);
    this.add.rectangle(944, 14, 76, 38, 0x0d1117).setOrigin(1, 0).setStrokeStyle(2, 0x444c56);
    uiText(this, 764, 33, '★ Star', { size: 20, color: '#e3b341', oy: 0.5 });
    this.stars = uiText(this, 906, 33, '', { size: 22, color: '#f5f5f5', ox: 0.5, oy: 0.5 });
    this.level = uiText(this, 480, 16, '', { size: 20, color: '#d97757', ox: 0.5 });
    this.reversed = uiText(this, 480, 80, '⇄ CONTROLS REVERSED', { size: 22, color: '#bc8cff', ox: 0.5 }).setVisible(false);

    this.bossBarBg = this.add.rectangle(330, 50, 300, 10, 0x2d2d2d).setOrigin(0);
    this.bossBar = this.add.rectangle(330, 50, 300, 10, 0xe5534b).setOrigin(0);
    this.bossText = uiText(this, 480, 64, '', { size: 14, color: '#e5534b', ox: 0.5 });

    // Terminal strip along the bottom.
    this.add.rectangle(0, 540, 960, 64, 0x0d0d0d, 0.92).setOrigin(0, 1).setStrokeStyle(2, 0xd97757);
    this.powers = Object.entries(POWERS).map(([name, p], i) => {
      const x = 16 + i * 150;
      const box = this.add.rectangle(x, 488, 140, 22, 0x2d2d2d).setOrigin(0);
      const fill = this.add.rectangle(x, 488, 140, 22, 0xd97757).setOrigin(0);
      const label = uiText(this, x + 70, 499, `[${p.key}] ${p.label}`, { size: 14, color: '#0d0d0d', ox: 0.5, oy: 0.5 });
      return { name, p, box, fill, label };
    });
    this.heard = uiText(this, 16, 516, '', { size: 16, color: '#f5f5f5' });
    this.mic = uiText(this, 944, 499, '', { size: 14, color: '#8b8b8b', ox: 1, oy: 0.5 });
    uiText(this, 944, 526, '←→ move   ↑ jump   SPACE prompt   M mic', { size: 14, color: '#8b8b8b', ox: 1, oy: 0.5 });
  }

  update(time) {
    const r = this.registry;
    const hp = r.get('hp') ?? 0;
    this.hearts.forEach((h, i) => (i < hp ? h.clearTint().setAlpha(1) : h.setTint(0x2d2d2d)));
    this.stars.setText(`${r.get('stars') ?? 0}`);
    this.level.setText(r.get('level') ?? '');
    this.reversed.setVisible(Boolean(r.get('reversed')) && Math.floor(time / 200) % 2 === 0);

    const boss = r.get('boss');
    const showBoss = Boolean(boss);
    this.bossBarBg.setVisible(showBoss);
    this.bossBar.setVisible(showBoss);
    this.bossText.setVisible(showBoss);
    if (boss) {
      this.bossBar.width = 300 * Phaser.Math.Clamp(boss.hp / Math.max(1, boss.max), 0, 1);
      this.bossText.setText(`CONTEXT ROT HYDRA   heads ${boss.heads}/3   turn ${boss.turn}`);
    }

    for (const pw of this.powers) {
      const left = voice.remaining(pw.name);
      const ready = left <= 0;
      pw.fill.width = 140 * (ready ? 1 : 1 - left / pw.p.cooldown);
      pw.fill.fillColor = ready ? 0xd97757 : 0x6b3b2b;
      pw.label.setColor(ready ? '#0d0d0d' : '#8b8b8b');
    }
    this.heard.setText(`$ heard: ${voice.heard ? `"${voice.heard.slice(-44)}"` : voice.enabled ? '(say "ship it")' : '...'}`);
    this.mic.setText(`${voice.enabled ? '●' : '○'} ${voice.status}`);
    this.mic.setColor(voice.enabled ? '#3fb950' : '#8b8b8b');
  }
}
