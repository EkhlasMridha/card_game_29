import { useEffect, useState } from 'react';
import { BANGLADESH_RULES } from '@twentynine/shared';
import { Toasts } from '../components/Toasts';
import { Privacy } from '../features/about/Privacy';
import { GameScreen } from '../features/game/GameScreen';
import { CreateGame } from '../features/lobby/CreateGame';
import { JoinGame } from '../features/lobby/JoinGame';
import { Lobby } from '../features/lobby/Lobby';
import { MainMenu } from '../features/menu/MainMenu';
import { RulesScreen } from '../features/rules/RulesScreen';
import { Tutorial } from '../features/rules/Tutorial';
import { net } from '../network/client';
import { useStore } from '../state/hooks';
import { store } from '../state/store';

export type AppScreen = 'menu' | 'create' | 'join' | 'tutorial' | 'rules' | 'privacy';

/**
 * Application navigation. Room membership (from the server) takes precedence:
 * when you are in a room you see the lobby or the table; otherwise the menus.
 * Navigation never decides whether a game action is legal — the server does.
 */
export function App() {
  const room = useStore((s) => s.room);
  const [screen, setScreen] = useState<AppScreen>('menu');

  useEffect(() => {
    net.connect();
    const onVisible = () => document.visibilityState === 'visible' && net.poke();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, []);

  // Each screen opens at the top, not at the previous screen's scroll position.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen, room?.phase]);

  // Returning from a room always lands on the main menu.
  useEffect(() => {
    if (!room) setScreen('menu');
  }, [room]);

  const quickPlay = () => {
    const name = store.getState().settings.name.trim();
    if (!name) {
      store.toast('Choose a display name first.', 'warn');
      setScreen('create');
      return;
    }
    net.send({ type: 'CREATE_ROOM', name, rules: BANGLADESH_RULES });
  };

  let content: React.ReactNode;
  if (room && room.phase === 'IN_GAME') content = <GameScreen room={room} />;
  else if (room && room.phase === 'LOBBY') content = <Lobby room={room} />;
  else {
    const back = () => setScreen('menu');
    content =
      screen === 'create' ? (
        <CreateGame onBack={back} />
      ) : screen === 'join' ? (
        <JoinGame onBack={back} />
      ) : screen === 'tutorial' ? (
        <Tutorial onBack={back} />
      ) : screen === 'rules' ? (
        <RulesScreen onBack={back} />
      ) : screen === 'privacy' ? (
        <Privacy onBack={back} />
      ) : (
        <MainMenu go={setScreen} quickPlay={quickPlay} />
      );
  }

  return (
    <>
      {content}
      <Toasts />
    </>
  );
}
