import { useEffect, useState } from 'react';
import { useTournament } from './useTournament';
import { DEFAULT_EARLY_BIRD, earlyBirdStatus, localDay } from '../config/earlyBird.js';

// The early-bird plan from the database (or the default until the admin saves one), evaluated for today.
export function useEarlyBird() {
  const { data } = useTournament(), [today, setToday] = useState(localDay);
  useEffect(() => { const timer = setInterval(() => setToday(localDay()), 60000); return () => clearInterval(timer); }, []);
  const plan = { ...DEFAULT_EARLY_BIRD, ...(data?.earlyBird || {}) };
  return { plan, bird: earlyBirdStatus(plan, today) };
}
