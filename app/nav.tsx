"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/",        label: "시그널 TOP" },
  { href: "/top",     label: "지역별" },
  { href: "/complex", label: "단지 조회" },
  { href: "/digest",  label: "다이제스트" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-[var(--line)]">
      <div className="max-w-4xl mx-auto w-full">
      <ul className="flex overflow-x-auto">
        {tabs.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                className={`block px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? "border-[var(--ink)] font-semibold text-[var(--ink)]"
                    : "border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      </div>
    </nav>
  );
}
