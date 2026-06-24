import { useState } from 'react';
import type { JSX } from 'react';
import { TalkScreen } from './screens/TalkScreen';
import { TrainingScreen } from './screens/TrainingScreen';
import './App.css';

type Mode = 'talk' | 'train';

export default function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('talk');

  return (
    <div className="app-root">
      {mode === 'talk' ? (
        <TalkScreen onTrain={() => setMode('train')} />
      ) : (
        <TrainingScreen onExit={() => setMode('talk')} />
      )}
    </div>
  );
}
