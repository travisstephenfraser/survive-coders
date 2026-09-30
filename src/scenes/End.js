import Phaser from 'phaser';
import { MAX_HP, uiText } from '../util.js';
import { voice } from '../voice.js';
import { applyScreenFX } from '../fx.js';
import { CREDITS, phoneCard, terminalWindow } from '../terminal.js';
import { placeLidar } from '../sprites.js';
import { playVictorySong } from '../victorySong.js';
import { TOUCH } from '../touch.js';
import { beginRun, run } from '../run.js';
import { MAX_STARS, formatTime } from '../../shared/leaderboard.js';
import { scoreForm } from '../scoreForm.js';
import { submitScore } from '../api.js';
import { loadProfile, playerId, saveBest, saveProfile } from '../profile.js';

// Every level after the first is a checkpoint: a death there retries that level.
const RETRY = { Park: 'retry the park', Tower: 'retry this floor', Chute: 'retry the fall', BossHQ: 'retry the boss' };
// Running out of health is a context problem; running out of altitude isn't.
const LOSE = {
  Chute: ['404: PARACHUTE NOT FOUND', TOUCH ? 'Salesforce Park broke your fall.\nTap faster: every tap types.' : 'Salesforce Park broke your fall.\nType faster, or press TAB.'],
};
const CONTEXT_LOST = ['CONTEXT EXHAUSTED', 'The vibes ran out.\nTry a smaller change.'];
// Why a finished run can't go on the leaderboard (run clock summary reasons).
const UNRANKED = {
  god: "god mode runs don't go on the board",
  dev: "level-jump starts (?park, ?boss...) don't go on the board",
  clock: 'failed a sanity check (clock)',
  stars: 'failed a sanity check (stars)',
  time: 'failed a sanity check (time)',
  splits: 'failed a sanity check (splits)',
};

export default class End extends Phaser.Scene {
  constructor() {
    super('End');
  }

  create({ win, retry }) {
    this.form = null;
    applyScreenFX(this.cameras.main);
    const stars = this.registry.get('stars') ?? 0;
    const w = terminalWindow(this, win ? 'git push origin main - success' : 'process exited with code 1');
    const left = w.x + 30;
    uiText(this, left, 90, win ? '$ git push origin main' : '$ npm run survive', { size: 16, color: '#8b8b8b' });
    // A win's time: the run clock stopped at the Hydra's fall (BossHQ.endEncounter).
    this.result = win ? run.summary(stars) : null;
    const [headline, story] = win
      ? ['SHIPPED.', `The Context Rot Hydra is compacted.\nYour small change is merged in ${formatTime(this.result.timeMs ?? 0)}.`]
      : (LOSE[retry] ?? CONTEXT_LOST);
    uiText(this, left, 126, headline, { size: win ? 64 : 40, color: win ? '#3fb950' : '#e5534b' });
    uiText(this, left, 214, story, { size: 16, color: '#f5f5f5', lineSpacing: 6 });
    uiText(this, left, 290, win ? `★ ${stars}/${MAX_STARS}` : `★ ${stars} GitHub stars`, { size: 40, color: '#e3b341' });
    // The right-hand panel holds the leaderboard form for a ranked win, or why it isn't ranked.
    if (win && !this.result.eligible) {
      uiText(this, 520, 176, `not ranked: ${UNRANKED[this.result.reasons[0]]}`, { size: 16, color: '#8b8b8b', wrap: 380 });
    }
    if (win && this.result.eligible) this.offerSubmit();
    // Cuphead-style progress on a boss death: show how close the run got.
    const boss = this.registry.get('boss');
    if (!win && retry === 'BossHQ' && boss) {
      uiText(this, left, 350, `hydra: ${3 - boss.heads}/3 heads cut`, { size: 16, color: '#d97757' });
    }
    const checkpoint = !win && RETRY[retry] ? retry : null;
    const retryLabel = checkpoint ? RETRY[checkpoint] : 'play again';
    const again = uiText(this, left, 430, TOUCH ? `$ tap to ${retryLabel}_` : `$ ENTER ${retryLabel}   T title_`, { size: 24, color: '#d97757' });
    // On touch the title screen gets its own button; a tap anywhere else retries (only a tap on
    // the prompt while the leaderboard form is up, so closing the phone keyboard can't).
    const titleBtn = TOUCH ? uiText(this, w.x + w.w - 30, 424, 'title', { size: 24, color: '#f5f5f5', ox: 1, bg: '#21262d', pad: 9 }) : null;
    titleBtn?.list[0].setStrokeStyle(3, 0x444c56); // the HUD's badge frame
    this.tweens.add({ targets: again, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    uiText(this, 480, 530, CREDITS, { size: 8, color: '#555555', ox: 0.5, oy: 1 });
    if (win) {
      this.payoff();
      const song = playVictorySong(this);
      this.events.once('shutdown', () => song?.stop());
    }
    // Fast retry (Team Meat: short respawns). Later levels restart at their own checkpoint.
    let done = false;
    const once = (fn) => () => {
      if (done) return;
      done = true;
      fn();
    };
    const playAgain = once(() => {
      if (win) return beginRun(this); // a new run, on a fresh clock; a retry keeps the clock going
      this.registry.set({
        hp: MAX_HP,
        boss: null,
        toast: null,
        stars: checkpoint ? (this.registry.get('checkpointStars') ?? 0) : 0,
        maxTokens: checkpoint ? (this.registry.get('checkpointTokens') ?? 0) : 0,
      });
      voice.resetCooldowns();
      this.scene.start(checkpoint ?? 'Level1');
    });
    const toTitle = once(() => this.scene.start('Title'));
    this.input.keyboard.once('keydown-ENTER', playAgain);
    this.input.keyboard.once('keydown-T', toTitle);
    // Touch: taps act on release and only if they began on this screen. (Desktop keeps keys
    // only, so a stray click can't cut the win screen short.)
    if (TOUCH) {
      let armed = false;
      this.input.on('pointerdown', () => (armed = true));
      this.input.on('pointerup', (p) => {
        if (!armed) return;
        if (Phaser.Geom.Rectangle.Inflate(titleBtn.getBounds(), 12, 12).contains(p.x, p.y)) toTitle();
        else if (!this.form || Phaser.Geom.Rectangle.Inflate(again.getBounds(), 12, 12).contains(p.x, p.y)) playAgain();
      });
    }
  }

  // A ranked win: the leaderboard form in the right-hand panel, under where the Slack card lands.
  offerSubmit() {
    const form = scoreForm({
      profile: loadProfile(),
      touch: TOUCH,
      submit: async (entry) => {
        saveProfile(entry);
        const r = await submitScore(this.result, entry, playerId());
        if (r.state === 'ok' && r.you.best) saveBest({ name: entry.name, stars: this.result.stars, timeMs: this.result.timeMs });
        return r;
      },
      view: (board) => this.scene.start('Leaderboard', { board }),
      close: () => {
        this.form?.destroy();
        this.form = null;
      },
    });
    this.form = this.add.dom(520, 166, form.root).setOrigin(0);
    if (!TOUCH) form.focus();
  }

  // Story bookend for the Waymo intro: the robotaxi comes back (HQ is in its service area),
  // and #demo-day asks for one more small change.
  payoff() {
    const car = this.add.image(-140, 404, 'waymo').setScale(2).setOrigin(0.5, 1);
    const sweep = this.add.image(-200, 0, 'px_cyan');
    const line = uiText(this, 290, 364, '', { size: 16, color: '#39c5cf' });
    const text = 'WAYMO: This is within my service area. Welcome back.';
    this.tweens.add({
      targets: car,
      x: 200,
      duration: 1600,
      delay: 500,
      ease: 'Cubic.out',
      onComplete: () => {
        let n = 0;
        this.time.addEvent({ delay: 28, repeat: text.length - 1, callback: () => line.setText(text.slice(0, ++n)) });
      },
    });
    const spin = (time) => placeLidar(sweep, car, time);
    this.events.on('update', spin);
    this.events.once('shutdown', () => this.events.off('update', spin)); // scene emitters outlive restarts
    const phone = phoneCard(this, 580, 62, 330, 'Slack · #demo-day');
    this.time.delayedCall(3600, () => phone.show('looks great!! one more small change?'));
  }
}
