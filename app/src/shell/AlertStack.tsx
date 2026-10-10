/** Notifikasi ringan di bawah menu bar (padanan alerts scratch-gui). */
import { useEffect } from "react";
import { CloseIcon } from "./icons";

export interface ShellAlert {
  id: number;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

export const ALERT_TIMEOUT_MS = 6000;

interface AlertStackProps {
  alerts: readonly ShellAlert[];
  onDismiss(id: number): void;
}

function AlertItem({ alert, onDismiss }: { alert: ShellAlert; onDismiss(id: number): void }) {
  useEffect(() => {
    const h = setTimeout(() => onDismiss(alert.id), ALERT_TIMEOUT_MS);
    return () => clearTimeout(h);
  }, [alert.id, onDismiss]);
  return (
    <div className={`kb-alert kb-alert--${alert.level}`} role={alert.level === "error" ? "alert" : "status"}>
      <span className="kb-alert__message">{alert.message}</span>
      <button type="button" className="kb-alert__close" aria-label="Tutup" onClick={() => onDismiss(alert.id)}>
        <CloseIcon size={12} />
      </button>
    </div>
  );
}

export function AlertStack({ alerts, onDismiss }: AlertStackProps) {
  if (alerts.length === 0) return null;
  return (
    <div className="kb-alerts">
      {alerts.map((a) => (
        <AlertItem key={a.id} alert={a} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
