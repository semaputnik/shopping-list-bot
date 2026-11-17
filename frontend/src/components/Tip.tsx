import { useEffect, useRef, type ReactNode } from "react";
import { Banner, IconButton } from "@telegram-apps/telegram-ui";

interface Props {
  /** An emoji that names the tip at a glance. */
  icon: string;
  title: string;
  text: string;
  closeLabel: string;
  onClose: () => void;
  /** One button under the text, e.g. «Поделиться» on the invite tip. */
  action?: ReactNode;
}

/** A one-time onboarding card floating above the list, so showing it never moves a row. */
export function Tip({ icon, title, text, closeLabel, onClose, action }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // The tip floats, so the screen reserves room for its real height (copy length varies by language).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const write = () => root.style.setProperty("--tip-height", `${el.offsetHeight}px`);
    write();
    const observer = new ResizeObserver(write);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--tip-height");
    };
  }, []);

  return (
    <div className="tip" role="status" ref={ref}>
      <Banner
        className="tip__banner"
        type="section"
        before={
          <span className="tip__icon" aria-hidden="true">
            {icon}
          </span>
        }
        header={title}
        subheader={text}
      >
        {action}
      </Banner>
      <IconButton mode="plain" size="s" className="tip__close" aria-label={closeLabel} onClick={onClose}>
        <span aria-hidden="true">✕</span>
      </IconButton>
    </div>
  );
}
