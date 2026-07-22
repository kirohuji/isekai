import { useState } from 'react';
import { NewGame } from './components/NewGame';
import { GameScreen } from './components/GameScreen';
import type { GameResponse } from './lib/api';

export default function App() {
  const [game, setGame] = useState<GameResponse | null>(null);

  if (!game) {
    return <NewGame onReady={setGame} />;
  }

  return (
    <GameScreen
      initial={game}
      onNewGame={() => {
        setGame(null);
      }}
    />
  );
}
