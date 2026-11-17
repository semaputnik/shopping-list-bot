import { useEffect, useRef, useState, type AnimationEvent, type ReactNode } from "react";
import { bindBackButton } from "../telegram";

interface Props {
  label: string;
  /** Called once the leave motion has finished; the parent then stops rendering the popover. */
  onClose: () => void;
  /** `choose(action)` closes the popover with its leave motion, then runs `action`. */
  children: (choose: (action?: () => void) => void) => ReactNode;
}

/**
 * A menu that grows out of its trigger: opacity 0 to 1, scale .96 to 1 and a 4 px rise in
 * .12s, and the same in reverse on the way out (pointer events off while it leaves).
 * The trigger's parent must be `position: relative`; the BackButton and Escape close it.
 */
export function Popover({ label, onClose, children }: Props) {
  const [leaving, setLeaving] = useState<{ action?: () => void } | null>(null);
  const request = useRef((action?: () => void) => setLeaving((now) => now ?? { action }));
  useEffect(() => bindBackButton(() => request.current()), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") request.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const finish = (event: AnimationEvent) => {
    // The enter motion also ends here; only the leave motion hands control back.
    if (event.animationName !== "popover-out" || !leaving) return;
    onClose();
    leaving.action?.();
  };

  return (
    <>
      <div className="popover__backdrop" onClick={() => request.current()} />
      <div
        className={leaving ? "popover popover--leaving" : "popover"}
        role="menu"
        aria-label={label}
        onAnimationEnd={finish}
      >
        {children(request.current)}
      </div>
    </>
  );
}
