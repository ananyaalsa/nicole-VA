import { useState } from 'react';
import type { JSX } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ToastProvider } from './ui/toast';
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

  // TalkScreen stays MOUNTED across mode switches (just hidden) so its live
  // session, transcript, and in-flight audio persist — switching to Training/
  // Roleplay pauses it in the background, and returning resumes the same
  // conversation. Only an explicit End clears it. Training/Roleplay are their
  // own sessions, mounted only while active.
  return (
    <div className="app-root">
      <div className="mode-pane" hidden={mode !== 'talk'} aria-hidden={mode !== 'talk'}>
        <TalkScreen
          onTrain={() => setMode('train')}
          onRoleplay={() => setMode('roleplay')}
          onSwitchMode={switchMode}
          defaultVoice={defaultVoice}
          backgrounded={mode !== 'talk'}
        />
      </div>
      {mode === 'train' && (
        <TrainingScreen
          onExit={() => setMode('talk')}
          onRoleplay={() => setMode('roleplay')}
        />
      )}
      {mode === 'roleplay' && (
        <RoleplayScreen
          onExit={() => setMode('talk')}
          onTrain={() => setMode('train')}
        />
      )}
    </div>
  );
}

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </AuthProvider>
  );
}
