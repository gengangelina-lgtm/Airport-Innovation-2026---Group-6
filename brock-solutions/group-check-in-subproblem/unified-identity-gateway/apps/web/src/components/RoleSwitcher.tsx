export type Role = 'PASSENGER' | 'AGENT' | 'ADMIN';

export function RoleSwitcher({ role, onChange }: { role: Role; onChange: (role: Role) => void }) {
  return (
    <div className="role-switcher">
      <button className={role === 'PASSENGER' ? 'active' : ''} onClick={() => onChange('PASSENGER')}>
        Passenger
      </button>
      <button className={role === 'AGENT' ? 'active' : ''} onClick={() => onChange('AGENT')}>
        Agent
      </button>
      <button className={role === 'ADMIN' ? 'active' : ''} onClick={() => onChange('ADMIN')}>
        Admin
      </button>
    </div>
  );
}
