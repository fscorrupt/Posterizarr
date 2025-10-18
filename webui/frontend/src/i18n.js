import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Import translations
import translationDE from "./locales/de/translation.json";
import translationEN from "./locales/en/translation.json";
import translationFR from "./locales/fr/translation.json";
import translationIT from "./locales/it/translation.json";
import translationPT from "./locales/pt/translation.json";

const resources = {
  de: {
    translation: translationDE,
  },
  en: {
    translation: translationEN,
  },
  fr: {
    translation: translationFR,
  },
  it: {
    translation: translationIT,
  },
  pt: {
    translation: translationPT,
  },
};

i18n
  .use(LanguageDetector) // Detect user language
  .use(initReactI18next) // Pass i18n to react-i18next
  .init({
    resources,
    lng: "en", // Set default language to English
    fallbackLng: "en",
    debug: false,

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;
