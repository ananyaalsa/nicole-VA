import { useState } from 'react';
import type { JSX } from 'react';
import { TalkScreen } from './screens/TalkScreen';
import { TrainingScreen } from './screens/TrainingScreen';
import { RoleplayScreen } from './screens/RoleplayScreen';
import './App.css';

type Mode = 'talk' | 'train' | 'roleplay';

export default function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('talk');

  return (
    <div className="app-root">
      {mode === 'talk' && (
        <TalkScreen
          onTrain={() => setMode('train')}
          onRoleplay={() => setMode('roleplay')}
        />
      )}
      {/* Training = the teacher experience; its History lives INSIDE the screen. */}
      {mode === 'train' && <TrainingScreen onExit={() => setMode('talk')} />}
      {mode === 'roleplay' && <RoleplayScreen onExit={() => setMode('talk')} />}
    </div>
  );
}
