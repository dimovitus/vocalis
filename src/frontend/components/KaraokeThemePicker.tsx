import type { KaraokeTheme, KaraokeThemeId } from "../../core/domain/karaoke-themes";
import { listKaraokeThemes } from "../../core/domain/karaoke-themes";

interface KaraokeThemePickerProps {
  activeId: KaraokeThemeId;
  onSelect: (id: KaraokeThemeId) => void;
}

export function KaraokeThemePicker({ activeId, onSelect }: KaraokeThemePickerProps) {
  const themes = listKaraokeThemes();

  return (
    <div className="karaoke-theme-picker" role="listbox" aria-label="Karaoke theme">
      {themes.map((theme) => (
        <ThemeChip
          key={theme.id}
          theme={theme}
          active={theme.id === activeId}
          onSelect={() => onSelect(theme.id)}
        />
      ))}
    </div>
  );
}

function ThemeChip({
  theme,
  active,
  onSelect,
}: {
  theme: KaraokeTheme;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className={`karaoke-theme-chip${active ? " is-active" : ""}`}
      onClick={onSelect}
      title={theme.name}
    >
      <span
        className="karaoke-theme-swatch"
        style={{
          background: theme.stageBackground,
          borderColor: theme.activeWordColor,
          boxShadow: theme.glow !== "none" ? theme.glow : undefined,
        }}
        aria-hidden
      />
      <span className="karaoke-theme-label">{theme.name}</span>
    </button>
  );
}
