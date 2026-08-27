import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_KARAOKE_THEME_ID,
  getKaraokeTheme,
  type KaraokeTheme,
  type KaraokeThemeId,
} from "../../core/domain/karaoke-themes";

interface KaraokeThemeStore {
  themeId: KaraokeThemeId;
  theme: KaraokeTheme;
  setThemeId: (id: KaraokeThemeId) => void;
}

export const useKaraokeThemeStore = create<KaraokeThemeStore>()(
  persist(
    (set) => ({
      themeId: DEFAULT_KARAOKE_THEME_ID,
      theme: getKaraokeTheme(DEFAULT_KARAOKE_THEME_ID),
      setThemeId: (id) =>
        set({
          themeId: id,
          theme: getKaraokeTheme(id),
        }),
    }),
    {
      name: "vocalis-karaoke-theme",
      partialize: (state) => ({ themeId: state.themeId }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<KaraokeThemeStore> | undefined;
        const themeId = saved?.themeId ?? DEFAULT_KARAOKE_THEME_ID;
        return {
          ...current,
          themeId,
          theme: getKaraokeTheme(themeId),
        };
      },
    },
  ),
);
