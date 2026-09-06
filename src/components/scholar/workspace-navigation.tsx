"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, FolderOpen, PenLine } from "lucide-react";

const sections = [
  { id: "materials", label: "Materials", icon: FolderOpen },
  { id: "writing", label: "Write", icon: PenLine },
  { id: "draft", label: "My draft", icon: FileText },
] as const;

export function WorkspaceNavigation() {
  const [activeSection, setActiveSection] = useState<string>("materials");
  const navigation = useRef<HTMLElement>(null);

  useEffect(() => {
    let frame = 0;
    const mobile = window.matchMedia("(max-width: 1023px)");
    const update = () => {
      frame = 0;
      if (!mobile.matches) return;
      const readingLine = (navigation.current?.offsetHeight || 74) + 24;
      let current: string = sections[0].id;
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= readingLine) current = section.id;
      }
      // A short final draft may never reach the top of the viewport.
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) current = "draft";
      setActiveSection(current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <nav ref={navigation} aria-label="Workspace sections" className="mobile-section-nav sticky top-0 z-30 lg:hidden">
      <div className="mobile-section-links">
        {sections.map(({ id, label, icon: Icon }) => (
          <a key={id} href={`#${id}`} aria-current={activeSection === id ? "location" : undefined}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
