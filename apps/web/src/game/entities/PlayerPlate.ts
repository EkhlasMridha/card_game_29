import Phaser from 'phaser';

const TEAM_COLORS = [0x3ccf91, 0xf0596b];

export interface PlateState {
  name: string;
  team: 0 | 1;
  connected: boolean;
  isTurn: boolean;
  isYou: boolean;
  info: string;
  badge: string | null;
}

/** Name plate for a seat: name, team stripe, status line and a pulsing turn ring. */
export class PlayerPlate extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private infoText: Phaser.GameObjects.Text;
  private badgeText: Phaser.GameObjects.Text;
  private pulse: Phaser.Tweens.Tween | null = null;
  private plateW = 0;
  private plateH = 0;
  private dpr = 1;
  private lastState: PlateState | null = null;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.ring = scene.add.graphics();
    this.bg = scene.add.graphics();
    this.nameText = scene.add.text(0, 0, '', { fontFamily: 'Inter Variable, system-ui, sans-serif', color: '#f6f0e1' });
    this.infoText = scene.add.text(0, 0, '', { fontFamily: 'Inter Variable, system-ui, sans-serif', color: '#b9c9bf' });
    this.badgeText = scene.add.text(0, 0, '', {
      fontFamily: 'Inter Variable, system-ui, sans-serif',
      color: '#08130f',
      backgroundColor: '#e2bf62',
      fontStyle: 'bold',
    });
    this.add([this.ring, this.bg, this.nameText, this.infoText, this.badgeText]);
    this.setDepth(5);
    scene.add.existing(this);
  }

  resize(w: number, h: number, d: number): void {
    this.plateW = w;
    this.plateH = h;
    this.dpr = d;
    this.nameText.setFontSize(13 * d).setPosition(-w / 2 + 14 * d, -h / 2 + 6 * d);
    this.infoText.setFontSize(11 * d).setPosition(-w / 2 + 14 * d, -h / 2 + 25 * d);
    this.badgeText.setFontSize(10 * d).setPadding(5 * d, 2 * d, 5 * d, 2 * d);
    if (this.lastState) this.applyState(this.lastState, true);
  }

  applyState(s: PlateState, force = false): void {
    const prev = this.lastState;
    this.lastState = s;
    const { plateW: w, plateH: h, dpr: d } = this;
    if (force || !prev || prev.team !== s.team || prev.isTurn !== s.isTurn || prev.connected !== s.connected) {
      this.bg.clear();
      this.bg.fillStyle(0x07110d, s.isTurn ? 0.92 : 0.78);
      this.bg.fillRoundedRect(-w / 2, -h / 2, w, h, 12 * d);
      this.bg.lineStyle(1.5 * d, s.isTurn ? 0xe2bf62 : 0xffffff, s.isTurn ? 0.9 : 0.12);
      this.bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 12 * d);
      this.bg.fillStyle(TEAM_COLORS[s.team], 1);
      this.bg.fillRoundedRect(-w / 2 + 5 * d, -h / 2 + 8 * d, 4 * d, h - 16 * d, 2 * d);

      this.ring.clear();
      this.pulse?.stop();
      this.pulse = null;
      this.ring.setAlpha(1);
      if (s.isTurn) {
        this.ring.lineStyle(4 * d, 0xe2bf62, 0.55);
        this.ring.strokeRoundedRect(-w / 2 - 4 * d, -h / 2 - 4 * d, w + 8 * d, h + 8 * d, 15 * d);
        this.pulse = this.scene.tweens.add({ targets: this.ring, alpha: 0.15, duration: 750, yoyo: true, repeat: -1 });
      }
    }
    const name = s.isYou ? `${s.name} (you)` : s.name;
    this.nameText.setText(this.fit(name, w - 28 * d - (s.badge ? 40 * d : 0), this.nameText));
    this.infoText.setText(s.connected ? s.info : 'Disconnected — waiting…');
    this.infoText.setColor(s.connected ? '#b9c9bf' : '#f0a35e');
    this.setAlpha(s.connected ? 1 : 0.7);
    this.badgeText.setText(s.badge ?? '').setVisible(!!s.badge);
    this.badgeText.setPosition(w / 2 - this.badgeText.width - 8 * d, -h / 2 + 7 * d);
  }

  private fit(text: string, maxW: number, obj: Phaser.GameObjects.Text): string {
    obj.setText(text);
    if (obj.width <= maxW) return text;
    let t = text;
    while (t.length > 1) {
      t = t.slice(0, -1);
      obj.setText(t + '…');
      if (obj.width <= maxW) return t + '…';
    }
    return t;
  }

  destroy(fromScene?: boolean): void {
    this.pulse?.stop();
    super.destroy(fromScene);
  }
}
