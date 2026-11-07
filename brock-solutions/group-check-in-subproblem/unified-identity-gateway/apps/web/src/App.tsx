import { useState } from 'react';
import { RoleSwitcher, type Role } from './components/RoleSwitcher';
import { PassengerView } from './components/PassengerView';
import { AgentView } from './components/AgentView';
import { AdminView } from './components/AdminView';
import './styles.css';

export default function App() {
  const [role, setRole] = useState<Role>('PASSENGER');

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand">
            <span className="brand-mark">DCS</span>
            <div>
              <h1>Unified Identity Gateway</h1>
              <p className="brand-sub">Check-in &middot; Identity verification &middot; Boarding</p>
            </div>
          </div>
          <RoleSwitcher role={role} onChange={setRole} />
        </div>
      </header>
      <main className="app">
        <div style={{ display: role === 'PASSENGER' ? 'block' : 'none' }}>
          <PassengerView />
        </div>
        <div style={{ display: role === 'AGENT' ? 'block' : 'none' }}>
          <AgentView />
        </div>
        <div style={{ display: role === 'ADMIN' ? 'block' : 'none' }}>
          <AdminView />
        </div>
      </main>
    </>
  );
}
