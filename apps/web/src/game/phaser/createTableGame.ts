import Phaser from 'phaser';
import type { TableBridge } from '../events/bridge';
import { TableScene } from '../scenes/TableScene';

/**
 * Creates the Phaser game inside `parent`. The canvas is rendered at device
 * resolution (capped at 2×) and zoomed down so cards stay crisp on phones.
 * Returns a disposer that removes listeners and destroys the game.
 */
export function createTableGame(parent: HTMLElement, bridge: TableBridge): () => void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = () => ({
    w: Math.max(1, Math.round(parent.clientWidth * dpr)),
    h: Math.max(1, Math.round(parent.clientHeight * dpr)),
  });
  const { w, h } = size();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#06140f',
    banner: false,
    audio: { noAudio: true },
    disableContextMenu: true,
    render: { antialias: true, powerPreference: 'high-performance' },
    scale: { mode: Phaser.Scale.NONE, width: w, height: h, zoom: 1 / dpr },
    input: { activePointers: 2 },
  });
  game.scene.add('table', TableScene, true, { bridge, dpr });

  let frame = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const s = size();
      if (s.w === game.scale.width && s.h === game.scale.height) return;
      game.scale.resize(s.w, s.h);
      game.scale.setZoom(1 / dpr);
    });
  });
  observer.observe(parent);

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    game.destroy(true);
  };
}
