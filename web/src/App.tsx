import { useState } from 'react';
import type { JSX } from 'react';
import { TalkScreen } from './screens/TalkScreen';
import { TrainingScreen } from './screens/TrainingScreen';
import { RoleplayScreen } from './screens/RoleplayScreen';
import { HistoryPanel } from './components/HistoryPanel';
import './App.css';

type Mode = 'talk' | 'train' | 'roleplay';

export default function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('talk');
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="app-root">
      {mode === 'talk' && (
        <TalkScreen
          onTrain={() => setMode('train')}
          onRoleplay={() => setMode('roleplay')}
          onHistory={() => setShowHistory(true)}
        />
      )}
      {mode === 'train' && <TrainingScreen onExit={() => setMode('talk')} />}
      {mode === 'roleplay' && <RoleplayScreen onExit={() => setMode('talk')} />}

      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}
    </div>
  );
}
