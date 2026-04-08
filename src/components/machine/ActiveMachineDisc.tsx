import { Zap, Flame, Crown } from "lucide-react";
import { MachineType, MACHINES } from "./MachineCard";

interface ActiveMachineDiscProps {
  machineType: MachineType;
  ratePerHour: number;
  reserveEmpty: boolean;
  piEarned: number;
}

const ActiveMachineDisc = ({ machineType, ratePerHour, reserveEmpty, piEarned }: ActiveMachineDiscProps) => {
  const machine = MACHINES.find((m) => m.id === machineType) ?? MACHINES[0];
  const gradientId = `disc-gradient-${machine.id}`;

  const animDuration = machineType === "elite" ? "3s" : machineType === "pro" ? "4s" : "5s";
  const dashArray = machineType === "elite"
    ? "180 185"
    : machineType === "pro"
      ? "220 145"
      : "260 105";

  const IconComponent = machineType === "elite" ? Crown : machineType === "pro" ? Flame : Zap;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex h-52 w-52 items-center justify-center">
        <div
          className={`absolute inset-0 rounded-full bg-gradient-to-r ${machine.gradientClass} blur-xl transition-opacity duration-500`}
          style={{ opacity: reserveEmpty ? 0.08 : 0.22 }}
        />

        <svg
          className="absolute h-full w-full"
          viewBox="0 0 140 140"
          style={{ animation: reserveEmpty ? undefined : `spin ${animDuration} linear infinite` }}
        >
          <circle
            cx="70" cy="70" r="58"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="8"
          />
          <circle
            cx="70" cy="70" r="58"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="8"
            strokeDasharray={dashArray}
            strokeLinecap="round"
            style={{
              opacity: reserveEmpty ? 0.25 : 1,
              filter: reserveEmpty ? "none" : `drop-shadow(0 0 8px ${machine.ringColors[0]})`
            }}
          />

          {machineType === "elite" && (
            <circle
              cx="70" cy="70" r="48"
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth="3"
              strokeDasharray="15 20"
              strokeLinecap="round"
              style={{
                opacity: reserveEmpty ? 0.1 : 0.5,
                animation: reserveEmpty ? undefined : `spin 6s linear infinite reverse`
              }}
            />
          )}

          {machineType === "pro" && (
            <circle
              cx="70" cy="70" r="50"
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth="2"
              strokeDasharray="8 16"
              strokeLinecap="round"
              style={{
                opacity: reserveEmpty ? 0.1 : 0.4,
                animation: reserveEmpty ? undefined : `spin 8s linear infinite reverse`
              }}
            />
          )}

          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={machine.ringColors[0]} />
              <stop offset="100%" stopColor={machine.ringColors[1]} />
            </linearGradient>
          </defs>
        </svg>

        <div className="relative z-10 flex flex-col items-center justify-center text-center gap-1">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${machine.gradientClass} shadow-lg`}
          >
            <IconComponent className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <p className={`text-2xl font-bold bg-gradient-to-r ${machine.gradientClass} bg-clip-text text-transparent leading-tight`}>
            {reserveEmpty ? "0.00" : ratePerHour.toFixed(2)}
          </p>
          <p className="text-[10px] font-medium text-muted-foreground">π / heure</p>
        </div>
      </div>

      <div className="text-center space-y-0.5">
        <p className="text-3xl font-bold text-foreground tabular-nums">
          {piEarned.toLocaleString("fr-FR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
          <span className="ml-1.5 text-base font-semibold text-primary">π</span>
        </p>
        <p className="text-xs text-muted-foreground">Total accumulé dans votre wallet</p>
      </div>
    </div>
  );
};

export default ActiveMachineDisc;
