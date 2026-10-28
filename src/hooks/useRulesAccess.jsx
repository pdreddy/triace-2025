import { createContext, useContext, useState } from 'react';
const RulesAccess = createContext(null);
export function RulesAccessProvider({ children }) {
  const [accepted, setAccepted] = useState(() => { try { return sessionStorage.getItem('traice-rules-accepted-v1') === 'yes'; } catch { return false; } });
  function accept() { try { sessionStorage.setItem('traice-rules-accepted-v1', 'yes'); } catch {} setAccepted(true); }
  return <RulesAccess.Provider value={{ accepted, accept }}>{children}</RulesAccess.Provider>;
}
export const useRulesAccess = () => useContext(RulesAccess);
