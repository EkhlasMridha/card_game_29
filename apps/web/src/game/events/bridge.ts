import type { CardId, GameEvent, GameView, RoomView } from '@card29/shared';
import { net } from '../../network/client';
import { store, type Settings } from '../../state/store';

/**
 * The only interface between Phaser and the rest of the app. Phaser reads
 * server snapshots through it and sends user intents back; it never holds an
 * authoritative copy of the game.
 */
export interface TableBridge {
  snapshot(): { game: GameView | null; room: RoomView | null; settings: Settings };
  subscribe(listener: () => void): () => void;
  onEvent(listener: (e: GameEvent) => void): () => void;
  playCard(card: CardId): boolean;
}

export function createBridge(): TableBridge {
  return {
    snapshot: () => {
      const s = store.getState();
      return { game: s.game, room: s.room, settings: s.settings };
    },
    subscribe: (l) => store.subscribe(l),
    onEvent: (l) => store.onGameEvent(l),
    playCard: (card) => net.send({ type: 'PLAY_CARD', card }),
  };
}
