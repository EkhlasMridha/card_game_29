import Phaser from 'phaser';
import {
  SUIT_NAMES,
  teamOf,
  type CardId,
  type CompletedTrickView,
  type GameEvent,
  type GameView,
  type RoomView,
  type Seat,
  type Suit,
} from '@card29/shared';
import { sfx } from '../../audio/sound';
import { formatServerText } from '../../network/eventText';
import { store } from '../../state/store';
import { CARD_W } from '../entities/cardArt';
import { PlayerPlate } from '../entities/PlayerPlate';
import { BACK_KEY, cardKey, loadCardTextures, suitKey } from '../entities/textures';
import type { TableBridge } from '../events/bridge';
import { computeLayout, type Layout, type RelSeat } from './layout';

type Img = Phaser.GameObjects.Image;

/**
 * The card table. Renders purely from server snapshots (via the bridge):
 * every render reconciles sprites against the latest GameView, so a dropped
 * animation or a reconnect can never desynchronise what is shown.
 */
export class TableScene extends Phaser.Scene {
  private bridge!: TableBridge;
  private d = 1;
  private L!: Layout;
  private ready = false;
  private destroyed = false;
  private unsubs: (() => void)[] = [];
  private feltImg: Img | null = null;
  private game_: GameView | null = null;
  private room: RoomView | null = null;

  private hand = new Map<CardId, Img>();
  private backs: Img[][] = [[], [], [], []];
  private trick = new Map<CardId, Img>();
  private collecting: { sprites: Img[]; winner: Seat; timer: Phaser.Time.TimerEvent } | null = null;
  private plates: PlayerPlate[] = [];
  private indicator: Img | null = null;
  private indicatorKey = '';
  private indicatorLabel: Phaser.GameObjects.Text | null = null;
  private hint: Phaser.GameObjects.Text | null = null;

  private hover: CardId | null = null;
  private pending: { card: CardId; at: number } | null = null;
  private lastCompletedKey: string | null = null;
  private firstRender = true;
  private instant = false;
  private mySeat: Seat = 0;
  private fourColor = false;
  private wasMyTurn = false;

  constructor() {
    super('table');
  }

  init(data: { bridge: TableBridge; dpr: number }): void {
    this.bridge = data.bridge;
    this.d = data.dpr;
  }

  create(): void {
    this.L = computeLayout(this.scale.width, this.scale.height, this.d);
    this.drawFelt();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());

    const fonts = Promise.all([
      document.fonts?.load(`600 16px 'Inter Variable'`),
      document.fonts?.load(`700 16px 'Cormorant Garamond'`),
    ]).catch(() => undefined);
    void Promise.all([loadCardTextures(this), fonts]).then(() => {
      if (this.destroyed) return;
      this.ready = true;
      for (let i = 0; i < 4; i++) this.plates.push(new PlayerPlate(this));
      this.hint = this.add
        .text(0, 0, '', { fontFamily: 'Inter Variable, system-ui, sans-serif', color: '#f0d68a' })
        .setOrigin(0.5)
        .setDepth(250)
        .setAlpha(0.9);
      this.unsubs.push(this.bridge.subscribe(() => this.renderState()));
      this.unsubs.push(this.bridge.onEvent((e) => this.onGameEvent(e)));
      this.applyLayoutToStatic();
      this.renderState();
    });
  }

  private cleanup(): void {
    this.destroyed = true;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
  }

  // ------------------------------------------------------------ helpers

  private get reduced(): boolean {
    return this.bridge.snapshot().settings.motion === 'reduced';
  }

  private dur(ms: number): number {
    return this.reduced || this.instant ? 0 : ms;
  }

  private rel(seat: Seat): RelSeat {
    return ((seat - this.mySeat + 4) % 4) as RelSeat;
  }

  private faceKey(card: CardId): string {
    return cardKey(card, this.fourColor);
  }

  private moveTo(s: Img, x: number, y: number, angle: number, scale: number, duration: number, delay = 0): void {
    this.tweens.killTweensOf(s);
    if (duration <= 0 && delay <= 0) {
      s.setPosition(x, y).setAngle(angle).setScale(scale);
      return;
    }
    this.tweens.add({ targets: s, x, y, angle, scale, duration: Math.max(1, duration), delay, ease: 'Cubic.easeOut' });
  }

  /** Card flies in face down from `from`, then flips face up (if a face key is given). */
  private flyIn(s: Img, to: { x: number; y: number; angle: number }, scale: number, delay: number, face: string | null, done?: () => void): void {
    s.setData('arriving', true);
    const flight = this.dur(380);
    this.tweens.add({
      targets: s,
      x: to.x,
      y: to.y,
      angle: to.angle,
      scale,
      duration: Math.max(1, flight),
      delay: this.reduced ? 0 : delay,
      ease: 'Cubic.easeOut',
      onStart: () => sfx.deal(),
      onComplete: () => {
        if (!face) {
          s.setData('arriving', false);
          done?.();
          return;
        }
        const flipDur = this.dur(110);
        this.tweens.add({
          targets: s,
          scaleX: 0,
          duration: Math.max(1, flipDur),
          onComplete: () => {
            s.setTexture(face);
            this.tweens.add({
              targets: s,
              scaleX: scale,
              duration: Math.max(1, flipDur),
              onComplete: () => {
                s.setData('arriving', false);
                done?.();
              },
            });
          },
        });
      },
    });
  }

  // ------------------------------------------------------------ table felt

  private drawFelt(): void {
    const { W, H, d, table } = this.L;
    if (this.feltImg) this.feltImg.setTexture('__DEFAULT');
    if (this.textures.exists('felt')) this.textures.remove('felt');
    const tex = this.textures.createCanvas('felt', Math.max(1, Math.round(W)), Math.max(1, Math.round(H)));
    if (!tex) return;
    const ctx = tex.getContext();
    ctx.fillStyle = '#06140f';
    ctx.fillRect(0, 0, W, H);

    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    // Rim
    const rim = ctx.createLinearGradient(0, table.y, 0, table.y + table.h);
    rim.addColorStop(0, '#4a3517');
    rim.addColorStop(0.5, '#2b1e0d');
    rim.addColorStop(1, '#1a1208');
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24 * d;
    rr(table.x, table.y, table.w, table.h, table.r);
    ctx.fillStyle = rim;
    ctx.fill();
    ctx.restore();

    // Felt
    const inset = 7 * d;
    const fx = table.x + inset, fy = table.y + inset, fw = table.w - inset * 2, fh = table.h - inset * 2;
    const cx = W / 2, cy = this.L.center.y;
    const felt = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(fw, fh) * 0.75);
    felt.addColorStop(0, '#1b8d61');
    felt.addColorStop(0.4, '#106b48');
    felt.addColorStop(0.8, '#0a4a32');
    felt.addColorStop(1, '#063322');
    rr(fx, fy, fw, fh, Math.max(4, table.r - inset));
    ctx.fillStyle = felt;
    ctx.fill();

    // Subtle cloth grain
    ctx.save();
    rr(fx, fy, fw, fh, Math.max(4, table.r - inset));
    ctx.clip();
    const dots = Math.min(9000, (fw * fh) / (60 * d * d));
    for (let i = 0; i < dots; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(fx + Math.random() * fw, fy + Math.random() * fh, d, d);
    }
    ctx.restore();

    // Inner gold line
    ctx.strokeStyle = 'rgba(226,191,98,0.22)';
    ctx.lineWidth = 1.5 * d;
    rr(fx + 10 * d, fy + 10 * d, fw - 20 * d, fh - 20 * d, Math.max(4, table.r - inset - 10 * d));
    ctx.stroke();

    // Watermark
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.font = `700 ${Math.round(Math.min(W, H) * 0.22)}px 'Cormorant Garamond', Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('29', cx, cy);

    tex.refresh();
    if (!this.feltImg) this.feltImg = this.add.image(0, 0, 'felt').setOrigin(0).setDepth(-10);
    else this.feltImg.setTexture('felt');
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.cameras.resize(size.width, size.height);
    this.L = computeLayout(size.width, size.height, this.d);
    this.drawFelt();
    if (!this.ready) return;
    this.applyLayoutToStatic();
    this.instant = true;
    this.renderState();
    // Collected trick sprites positions are transient; finish them immediately.
    this.finishCollect();
    this.instant = false;
  }

  private applyLayoutToStatic(): void {
    for (const p of this.plates) p.resize(this.L.plateW, this.L.plateH, this.d);
    this.hint?.setFontSize(13 * this.d);
  }

  // ------------------------------------------------------------ events

  private onGameEvent(e: GameEvent): void {
    if (!this.ready) return;
    switch (e.type) {
      case 'DEALT':
        if (e.round === 1) this.clearTable();
        break;
      case 'TRUMP_REVEALED':
        sfx.reveal();
        this.banner(`Trump: ${SUIT_NAMES[e.suit]}`, e.by === e.bidder ? `Declared by ${this.nameOf(e.by)}` : `Asked for by ${this.nameOf(e.by)}`, e.suit);
        break;
      case 'PAIR_DECLARED':
        sfx.pair();
        this.banner('King–Queen pair', formatServerText(e.pair.note, this.room, this.mySeat), null);
        break;
      case 'MATCH_COMPLETED':
        sfx.win();
        break;
      case 'NOTICE':
        if (e.message === '__rejected:PLAY_CARD') {
          this.pending = null;
          sfx.error();
          this.layoutHand();
        }
        break;
      default:
        break;
    }
  }

  private nameOf(seat: Seat): string {
    if (seat === this.mySeat) return 'you';
    return this.room?.seats[seat]?.name ?? `Seat ${seat + 1}`;
  }

  private clearTable(): void {
    this.finishCollect();
    for (const s of this.trick.values()) s.destroy();
    this.trick.clear();
    this.indicator?.destroy();
    this.indicator = null;
    this.indicatorKey = '';
    this.indicatorLabel?.destroy();
    this.indicatorLabel = null;
    this.pending = null;
  }

  private banner(title: string, subtitle: string, suit: Suit | null): void {
    const { center, d } = this.L;
    const w = Math.min(this.L.W - 24 * d, 320 * d);
    const h = 86 * d;
    const c = this.add.container(center.x, center.y).setDepth(400);
    const g = this.add.graphics();
    g.fillStyle(0x06110d, 0.94);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 16 * d);
    g.lineStyle(2 * d, 0xe2bf62, 0.85);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 16 * d);
    c.add(g);
    let textX = -w / 2 + 20 * d;
    if (suit) {
      const disc = this.add.image(-w / 2 + 16 * d + 30 * d, 0, suitKey(suit)).setDisplaySize(58 * d, 58 * d);
      c.add(disc);
      textX = -w / 2 + 92 * d;
    }
    const t1 = this.add.text(textX, -14 * d, title, {
      fontFamily: "'Cormorant Garamond', Georgia, serif",
      fontSize: `${26 * d}px`,
      fontStyle: 'bold',
      color: '#f0d68a',
    });
    t1.setOrigin(0, 0.5);
    const t2 = this.add.text(textX, 16 * d, subtitle, {
      fontFamily: 'Inter Variable, system-ui, sans-serif',
      fontSize: `${12 * d}px`,
      color: '#cfdcd4',
      wordWrap: { width: w - (textX + w / 2) - 14 * d },
    });
    t2.setOrigin(0, 0.5);
    c.add([t1, t2]);
    c.setScale(0.7).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: this.dur(320), ease: 'Back.easeOut' });
    this.tweens.add({
      targets: c,
      alpha: 0,
      delay: 2200,
      duration: 400,
      onComplete: () => c.destroy(),
    });
  }

  // ------------------------------------------------------------ rendering

  private renderState(): void {
    if (!this.ready || this.destroyed) return;
    const { game, room, settings } = this.bridge.snapshot();
    this.room = room;
    this.game_ = game;
    if (!game || !room) return;

    if (settings.fourColor !== this.fourColor) {
      this.fourColor = settings.fourColor;
      for (const [card, s] of [...this.hand, ...this.trick]) if (s.texture.key !== BACK_KEY) s.setTexture(this.faceKey(card));
    }
    if (this.mySeat !== game.yourSeat) {
      this.mySeat = game.yourSeat;
      this.instant = true;
    }

    this.renderPlates(game, room);
    this.renderTrick(game);
    this.renderHand(game);
    this.renderBacks(game);
    this.renderIndicator(game);
    this.renderHint(game);

    const myTurn = game.turn === this.mySeat && !this.firstRender;
    if (myTurn && !this.wasMyTurn) sfx.turn();
    this.wasMyTurn = game.turn === this.mySeat;
    this.firstRender = false;
    this.instant = false;
  }

  private renderPlates(game: GameView, room: RoomView): void {
    const b = game.bidding;
    for (let i = 0; i < 4; i++) {
      const seat = i as Seat;
      const plate = this.plates[seat];
      const pos = this.L.plate[this.rel(seat)];
      plate.setPosition(pos.x, pos.y);
      const parts: string[] = [];
      if (game.phase === 'BIDDING' && b) {
        if (b.passed[seat]) parts.push('Passed');
        else if (b.highBidder === seat && b.highBid !== null) parts.push(b.style === 'priority' && b.challenger !== null ? `Priority · ${b.highBid}` : `Holding ${b.highBid}`);
        else if (b.challenger === seat) parts.push('Challenging');
      } else if (game.contract?.bidder === seat) {
        parts.push(`Bidder · ${game.contract.bid}`);
      }
      parts.push(`${game.handCounts[seat]} card${game.handCounts[seat] === 1 ? '' : 's'}`);
      plate.applyState({
        name: room.seats[seat]?.name ?? `Seat ${seat + 1}`,
        team: teamOf(seat),
        connected: room.seats[seat]?.connected ?? false,
        isTurn: game.turn === seat,
        isYou: seat === this.mySeat,
        info: parts.join(' · '),
        badge: game.dealer === seat ? 'DEALER' : null,
      });
    }
  }

  private takeSprite(seat: Seat, card: CardId): Img {
    let s = this.trick.get(card);
    if (s) {
      this.trick.delete(card);
      return s;
    }
    s = this.hand.get(card);
    if (s) {
      this.hand.delete(card);
      s.removeAllListeners();
      s.disableInteractive();
      s.clearTint();
      s.setData('arriving', false);
      if (s.texture.key === BACK_KEY) s.setTexture(this.faceKey(card));
      return s;
    }
    const o = this.L.origin[this.rel(seat)];
    s = this.add.image(o.x, o.y, this.faceKey(card)).setScale(this.L.smallW / CARD_W);
    return s;
  }

  private renderTrick(game: GameView): void {
    const completed = game.lastTrick;
    const key = completed ? `${game.dealNumber}:${completed.index}:${completed.plays.map((p) => p.card).join(',')}` : null;
    if (key !== this.lastCompletedKey) {
      const isFirst = this.firstRender;
      this.lastCompletedKey = key;
      if (completed && !isFirst) {
        this.finishCollect();
        const sprites = completed.plays.map((p, i) => {
          const s = this.takeSprite(p.seat, p.card);
          const spot = this.L.spot[this.rel(p.seat)];
          s.setDepth(50 + i);
          this.moveTo(s, spot.x, spot.y, spot.angle, this.L.trickW / CARD_W, this.dur(260));
          return s;
        });
        sfx.card();
        this.startCollect(sprites, completed);
      }
    }

    const plays = game.currentTrick?.plays ?? [];
    const live = new Set(plays.map((p) => p.card));
    for (const [card, s] of this.trick) {
      if (!live.has(card)) {
        s.destroy();
        this.trick.delete(card);
      }
    }
    if (plays.length > 0) this.finishCollect();
    plays.forEach((p, i) => {
      let s = this.trick.get(p.card);
      const isNew = !s;
      if (!s) {
        s = this.takeSprite(p.seat, p.card);
        this.trick.set(p.card, s);
        if (!this.firstRender) sfx.card();
      }
      const spot = this.L.spot[this.rel(p.seat)];
      s.setDepth(50 + i);
      if (isNew || this.instant) this.moveTo(s, spot.x, spot.y, spot.angle, this.L.trickW / CARD_W, this.firstRender ? 0 : this.dur(280));
    });
  }

  private startCollect(sprites: Img[], trick: CompletedTrickView): void {
    const winnerIdx = trick.plays.findIndex((p) => p.seat === trick.winner);
    const winSprite = sprites[winnerIdx];
    const hold = this.reduced ? 500 : 1100;
    if (winSprite) {
      winSprite.setDepth(60);
      this.tweens.add({
        targets: winSprite,
        scale: (this.L.trickW / CARD_W) * 1.12,
        delay: this.dur(300),
        duration: this.dur(200),
        yoyo: true,
        hold: 300,
      });
    }
    this.collecting = {
      sprites,
      winner: trick.winner,
      timer: this.time.delayedCall(hold, () => this.sweep()),
    };
  }

  private sweep(): void {
    const c = this.collecting;
    if (!c) return;
    this.collecting = null;
    c.timer.remove(false);
    const o = this.L.origin[this.rel(c.winner)];
    sfx.collect();
    for (const s of c.sprites) {
      this.tweens.killTweensOf(s);
      if (this.instant || this.reduced) {
        s.destroy();
        continue;
      }
      this.tweens.add({
        targets: s,
        x: o.x,
        y: o.y,
        angle: 0,
        scale: (this.L.smallW / CARD_W) * 0.8,
        alpha: 0,
        duration: 360,
        ease: 'Cubic.easeIn',
        onComplete: () => s.destroy(),
      });
    }
  }

  private finishCollect(): void {
    if (this.collecting) this.sweep();
  }

  private handSlot(i: number, n: number): { x: number; y: number; angle: number } {
    const L = this.L;
    const maxSpread = L.W - 24 * L.d - L.handW;
    const step = n > 1 ? Math.min(L.handW * 0.68, maxSpread / (n - 1)) : 0;
    const off = i - (n - 1) / 2;
    return { x: L.W / 2 + off * step, y: L.handY + off * off * 1.8 * L.d, angle: off * 2.4 };
  }

  private renderHand(game: GameView): void {
    const cards = game.yourHand;
    const inHand = new Set(cards);
    for (const [card, s] of this.hand) {
      if (!inHand.has(card)) {
        this.hand.delete(card);
        s.removeAllListeners();
        this.tweens.killTweensOf(s);
        this.tweens.add({ targets: s, alpha: 0, y: s.y + 40 * this.d, duration: this.dur(250), onComplete: () => s.destroy() });
      }
    }
    if (this.pending && !inHand.has(this.pending.card)) this.pending = null;

    const scale = this.L.handW / CARD_W;
    let arrivals = 0;
    cards.forEach((card, i) => {
      if (this.hand.has(card)) return;
      const target = this.handSlot(i, cards.length);
      const animate = !this.firstRender && !this.instant && !this.reduced;
      const from = animate ? this.L.origin[this.rel(game.dealer)] : target;
      const s = this.add.image(from.x, from.y, animate ? BACK_KEY : this.faceKey(card));
      s.setData('card', card);
      s.setInteractive({ useHandCursor: true });
      s.on('pointerup', () => this.onCardTap(card));
      s.on('pointerover', (p: Phaser.Input.Pointer) => {
        if (p.wasTouch) return;
        this.hover = card;
        this.layoutHand();
      });
      s.on('pointerout', () => {
        if (this.hover === card) {
          this.hover = null;
          this.layoutHand();
        }
      });
      this.hand.set(card, s);
      if (animate) {
        s.setScale(this.L.smallW / CARD_W);
        this.flyIn(s, target, scale, arrivals++ * 90, this.faceKey(card), () => this.layoutHand());
      } else {
        s.setScale(scale).setAngle(target.angle);
      }
    });
    this.layoutHand();
  }

  /** Position and style hand cards (legal = bright, others dimmed when it is your turn). */
  private layoutHand(): void {
    const game = this.game_;
    if (!game) return;
    const cards = game.yourHand.filter((c) => this.hand.has(c));
    const myTurn = game.phase === 'PLAYING' && game.turn === this.mySeat;
    const legal = new Set(game.actions.legalCards);
    const scale = this.L.handW / CARD_W;
    const d = this.d;
    cards.forEach((card, i) => {
      const s = this.hand.get(card)!;
      s.setDepth(100 + i);
      const isLegal = myTurn && legal.has(card);
      if (myTurn && !isLegal) s.setTint(0x7f8782);
      else s.clearTint();
      if (s.getData('arriving')) return;
      const slot = this.handSlot(i, cards.length);
      let lift = 0;
      if (isLegal) lift = 12 * d;
      if (this.hover === card && isLegal) lift = 22 * d;
      if (this.pending?.card === card) lift = 50 * d;
      this.moveTo(s, slot.x, slot.y - lift, this.pending?.card === card ? 0 : slot.angle, scale, this.dur(180));
    });
  }

  private onCardTap(card: CardId): void {
    const game = this.game_;
    const s = this.hand.get(card);
    if (!game || !s) return;
    if (game.phase !== 'PLAYING' || game.turn !== this.mySeat) {
      this.nudge(s);
      return;
    }
    if (this.pending && Date.now() - this.pending.at < 4000) return;
    if (!game.actions.legalCards.includes(card)) {
      this.nudge(s);
      if (game.actions.mustRequestReveal) store.toast('You cannot follow suit — ask for trump first.', 'warn');
      else store.toast('You must follow the suit that was led.', 'warn', 2000);
      return;
    }
    if (this.bridge.playCard(card)) this.pending = { card, at: Date.now() };
    this.layoutHand();
    this.renderHint(game);
  }

  private nudge(s: Img): void {
    if (this.reduced) return;
    const x = s.x;
    this.tweens.add({ targets: s, x: x + 6 * this.d, duration: 50, yoyo: true, repeat: 2, onComplete: () => s.setX(x) });
  }

  private renderBacks(game: GameView): void {
    const L = this.L;
    const scale = L.smallW / CARD_W;
    for (let i = 0; i < 4; i++) {
      const seat = i as Seat;
      const arr = this.backs[seat];
      const count = seat === this.mySeat ? 0 : game.handCounts[seat];
      while (arr.length > count) arr.pop()!.destroy();
      const rel = this.rel(seat);
      const o = L.origin[rel];
      const step = L.smallW * 0.3;
      const slot = (k: number, n: number) => {
        const off = k - (n - 1) / 2;
        if (rel === 2) return { x: o.x + off * step, y: o.y, angle: 180 + off * 2 };
        if (rel === 1) return { x: o.x, y: o.y + off * step, angle: 90 + off * 2 };
        return { x: o.x, y: o.y + off * step, angle: -90 - off * 2 };
      };
      let arrivals = 0;
      while (arr.length < count) {
        const k = arr.length;
        const target = slot(k, count);
        const animate = !this.firstRender && !this.instant && !this.reduced;
        const from = animate ? L.origin[this.rel(game.dealer)] : target;
        const s = this.add.image(from.x, from.y, BACK_KEY).setScale(scale).setDepth(10 + k);
        arr.push(s);
        if (animate) this.flyIn(s, target, scale, arrivals++ * 90 + 40, null, () => this.layoutBacks(seat));
        else s.setAngle(target.angle);
      }
      this.layoutBacks(seat, slot);
    }
  }

  private layoutBacks(seat: Seat, slotFn?: (k: number, n: number) => { x: number; y: number; angle: number }): void {
    const arr = this.backs[seat];
    const L = this.L;
    const rel = this.rel(seat);
    const o = L.origin[rel];
    const step = L.smallW * 0.3;
    const slot =
      slotFn ??
      ((k: number, n: number) => {
        const off = k - (n - 1) / 2;
        if (rel === 2) return { x: o.x + off * step, y: o.y, angle: 180 + off * 2 };
        if (rel === 1) return { x: o.x, y: o.y + off * step, angle: 90 + off * 2 };
        return { x: o.x, y: o.y + off * step, angle: -90 - off * 2 };
      });
    arr.forEach((s, k) => {
      if (s.getData('arriving')) return;
      const t = slot(k, arr.length);
      s.setDepth(10 + k);
      this.moveTo(s, t.x, t.y, t.angle, L.smallW / CARD_W, this.dur(200));
    });
  }

  private renderIndicator(game: GameView): void {
    const t = game.trump;
    const c = game.contract;
    const visible = !!c && t.chosen && (game.phase === 'DOUBLING' || game.phase === 'PLAYING');
    if (!visible || !c) {
      this.indicator?.destroy();
      this.indicator = null;
      this.indicatorKey = '';
      this.indicatorLabel?.destroy();
      this.indicatorLabel = null;
      return;
    }
    const L = this.L;
    const p = L.indicator[this.rel(c.bidder)];
    let key: string;
    let label: string;
    let size: { w: number; h: number };
    if (t.revealed && t.suit) {
      key = suitKey(t.suit);
      label = `Trump · ${SUIT_NAMES[t.suit]}`;
      size = { w: L.smallW * 1.15, h: L.smallW * 1.15 };
    } else if (t.seventhCard) {
      key = this.faceKey(t.seventhCard);
      label = 'Your 7th card (trump)';
      size = { w: L.smallW, h: L.smallH };
    } else {
      key = BACK_KEY;
      label = c.bidder === this.mySeat && t.suit ? `Your trump: ${SUIT_NAMES[t.suit]}` : 'Trump · hidden';
      size = { w: L.smallW, h: L.smallH };
    }

    if (!this.indicator) {
      this.indicator = this.add.image(p.x, p.y, key).setDepth(30);
      this.indicatorKey = key;
      this.indicator.setDisplaySize(size.w, size.h);
      this.indicator.setAngle(-8);
    } else {
      this.indicator.setPosition(p.x, p.y);
      if (key !== this.indicatorKey) {
        const ind = this.indicator;
        this.indicatorKey = key;
        const flipDur = this.dur(160);
        this.tweens.killTweensOf(ind);
        if (flipDur <= 0) {
          ind.setTexture(key).setDisplaySize(size.w, size.h).setAngle(0);
        } else {
          this.tweens.add({
            targets: ind,
            scaleX: 0,
            duration: flipDur,
            onComplete: () => {
              ind.setTexture(key).setDisplaySize(size.w, size.h);
              const sx = ind.scaleX;
              ind.setScale(0, ind.scaleY);
              this.tweens.add({ targets: ind, scaleX: sx, angle: 0, duration: flipDur, ease: 'Back.easeOut' });
            },
          });
        }
      } else if (!this.tweens.isTweening(this.indicator)) {
        this.indicator.setDisplaySize(size.w, size.h);
      }
    }

    if (!this.indicatorLabel) {
      this.indicatorLabel = this.add
        .text(0, 0, '', {
          fontFamily: 'Inter Variable, system-ui, sans-serif',
          color: '#f0d68a',
          backgroundColor: 'rgba(6,17,13,0.8)',
        })
        .setOrigin(0.5, 0)
        .setDepth(31);
    }
    this.indicatorLabel
      .setText(label)
      .setFontSize(10 * this.d)
      .setPadding(5 * this.d, 2 * this.d, 5 * this.d, 2 * this.d);
    const lx = Math.min(L.W - this.indicatorLabel.width / 2 - 4 * this.d, Math.max(this.indicatorLabel.width / 2 + 4 * this.d, p.x));
    this.indicatorLabel.setPosition(lx, p.y + size.h / 2 + 4 * this.d);
  }

  private renderHint(game: GameView): void {
    if (!this.hint) return;
    const myTurn = game.phase === 'PLAYING' && game.turn === this.mySeat;
    let text = '';
    if (myTurn) {
      if (game.actions.mustRequestReveal) text = 'You cannot follow suit — ask for trump';
      else text = 'Your turn — tap a bright card to play it';
    }
    this.hint.setText(text).setVisible(!!text);
    this.hint.setPosition(this.L.W / 2, this.L.handTop - 58 * this.d);
  }
}
