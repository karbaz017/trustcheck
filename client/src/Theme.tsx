import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const read = (): Theme => {
  try {
    const t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") return t;
  } catch { /* storage unavailable */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(read);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try { localStorage.setItem("theme", theme); } catch { /* ignore */ }
  }, [theme]);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" onClick={() => setTheme(next)} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-400 text-lg hover:bg-slate-100">
      <span aria-hidden>{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}
