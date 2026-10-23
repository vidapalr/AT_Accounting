"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import styles from "@/app/(workspace)/workspace.module.css";

/** On a phone the menu hides behind one big button; on a computer it is always shown. */
export default function MobileMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
        <span>{open ? "Close menu" : "Menu"}</span>
      </button>
      <div className={`${styles.navWrap} ${open ? styles.navWrapOpen : ""}`}>{children}</div>
    </>
  );
}
