import { GameCanvas } from './components/GameCanvas.js';
import { SignInButton } from './components/SignInButton.js';

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Age of Factories</h1>
        <SignInButton />
      </header>
      <main className="app-main">
        <GameCanvas />
      </main>
    </div>
  );
}
