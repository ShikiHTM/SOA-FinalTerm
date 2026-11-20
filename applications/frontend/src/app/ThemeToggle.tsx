import type { ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import type { Theme } from "./theme";

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }): ReactNode {
    const label: string =
        theme === "light" ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng";
    return (
        <button
            className="theme-toggle"
            type="button"
            aria-label={label}
            title={label}
            onClick={onToggle}
        >
            {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
        </button>
    );
}
