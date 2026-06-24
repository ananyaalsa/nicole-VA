import { useState } from 'react';
import type { JSX } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AuthScreen } from './screens/AuthScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { TalkScreen } from './screens/TalkScreen';
import { TrainingScreen } from './screens/TrainingScreen';
import { RoleplayScreen } from './screens/RoleplayScreen';
import './App.css';

type Mode = 'talk' | 'train' | 'roleplay';

function AppInner(): JSX.Element {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('talk');

  if (!auth.user) return <AuthScreen />;
  if (!auth.user.onboardingDone) return <OnboardingScreen />;

  const defaultVoice = auth.user.preferredVoice;

  // Nicole switches screens by voice (switch_mode tool); 'training' -> 'train'.
  const switchMode = (m: 'talk' | 'training' | 'roleplay') =>
    setMode(m === 'training' ? 'train' : m);

  return (
    <div className="app-root">
      {mode === 'talk' && (
        <TalkScreen
          onTrain={() => setMode('train')}
          onRoleplay={() => setMode('roleplay')}
          onSwitchMode={switchMode}
          defaultVoice={defaultVoice}
        />
      )}
      {/* Training = the teacher experience; its History lives INSIDE the screen. */}
      {mode === 'train' && <TrainingScreen onExit={() => setMode('talk')} />}
      {mode === 'roleplay' && <RoleplayScreen onExit={() => setMode('talk')} />}
    </div>
  );
}

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
