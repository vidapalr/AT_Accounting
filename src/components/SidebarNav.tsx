"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  LayoutDashboard,
  Receipt,
  Truck,
  Wrench,
  Package,
  Settings,
  Users,
} from "lucide-react";

import { activeHref, type NavSection } from "@/lib/navigation";
import styles from "@/app/(workspace)/workspace.module.css";

const ICONS = {
  home: LayoutDashboard,
  sell: Receipt,
  buy: Truck,
  work: Wrench,
  stock: Package,
  reports: BarChart3,
  investors: Users,
  accounting: BookOpen,
  setup: Settings,
};

/** Sidebar: the section you are in stays open, the page you are on is highlighted. */
export default function SidebarNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const active = activeHref(pathname, sections);
  const [openByUser, setOpenByUser] = useState<Record<string, boolean>>({});

  return (
    <nav className={styles.navigation} aria-label="Main menu">
      {sections.map((section) => {
        const Icon = ICONS[section.icon];

        if (section.items.length === 1) {
          const item = section.items[0];
          return (
            <Link
              key={section.id}
              href={item.href}
              title={item.hint}
              className={`${styles.navLink} ${item.href === active ? styles.navActive : ""}`}
              aria-current={item.href === active ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        }

        const containsActive = section.items.some((item) => item.href === active);
        const open = openByUser[section.id] ?? containsActive;

        return (
          <div key={section.id} className={styles.navGroup}>
            <button
              type="button"
              className={`${styles.navGroupSummary} ${containsActive ? styles.navGroupActive : ""}`}
              aria-expanded={open}
              onClick={() => setOpenByUser((state) => ({ ...state, [section.id]: !open }))}
            >
              <Icon size={18} />
              <span>{section.label}</span>
              <ChevronDown className={`${styles.navGroupChevron} ${open ? styles.navChevronOpen : ""}`} size={16} />
            </button>
            {open && (
              <div className={styles.subNavigation}>
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.hint}
                    className={`${styles.subNavLink} ${item.href === active ? styles.subNavActive : ""}`}
                    aria-current={item.href === active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
