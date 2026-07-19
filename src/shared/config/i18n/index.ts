"use client";

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ru from "./locales/ru.json";
import en from "./locales/en.json";

const STORAGE_KEY = "ai-master-lang";

export type TLanguage = "ru" | "en";

function getInitialLang(): TLanguage {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "ru" || stored === "en") return stored;
  const browserLang = navigator.language.split("-")[0];
  if (browserLang === "ru") return "ru";
  return "en";
}

export function getSavedLang(): TLanguage {
  return getInitialLang();
}

export function saveLanguage(lang: TLanguage): void {
  localStorage.setItem(STORAGE_KEY, lang);
}

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: getInitialLang(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
