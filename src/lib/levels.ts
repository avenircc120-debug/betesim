export interface LevelInfo {
  name: string;
  emoji: string;
  minPi: number;
  color: string;
  gradient: string;
}

const LEVELS: LevelInfo[] = [
  { name: "Bronze", emoji: "🥉", minPi: 0, color: "text-warning", gradient: "gradient-gold" },
  { name: "Argent", emoji: "🥈", minPi: 5000, color: "text-muted-foreground", gradient: "bg-muted" },
  { name: "Or", emoji: "🥇", minPi: 20000, color: "text-gold", gradient: "gradient-gold" },
  { name: "Diamant", emoji: "💎", minPi: 100000, color: "text-primary", gradient: "gradient-primary" },
];

export const getLevelInfo = (piBalance: number): LevelInfo => {
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (piBalance >= level.minPi) current = level;
  }
  return current;
};

export const getNextLevel = (piBalance: number): LevelInfo | null => {
  for (const level of LEVELS) {
    if (piBalance < level.minPi) return level;
  }
  return null;
};

export const getLevelProgress = (piBalance: number): number => {
  const current = getLevelInfo(piBalance);
  const next = getNextLevel(piBalance);
  if (!next) return 100;
  const range = next.minPi - current.minPi;
  const progress = piBalance - current.minPi;
  return Math.min((progress / range) * 100, 100);
};

export const ALL_LEVELS = LEVELS;
