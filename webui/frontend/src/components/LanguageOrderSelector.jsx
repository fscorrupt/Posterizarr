import React, { useState, useEffect } from "react";
import { ChevronDown, GripVertical, Plus, X } from "lucide-react";

// ISO 639-1 language codes with common languages
const COMMON_LANGUAGES = [
  { code: "xx", name: "Textless (No Text)" },
  { code: "en", name: "English" },
  { code: "de", name: "German (Deutsch)" },
  { code: "es", name: "Spanish (Español)" },
  { code: "fr", name: "French (Français)" },
  { code: "it", name: "Italian (Italiano)" },
  { code: "pt", name: "Portuguese (Português)" },
  { code: "ru", name: "Russian (Русский)" },
  { code: "ja", name: "Japanese (日本語)" },
  { code: "ko", name: "Korean (한국어)" },
  { code: "zh", name: "Chinese (中文)" },
  { code: "ar", name: "Arabic (العربية)" },
  { code: "hi", name: "Hindi (हिन्दी)" },
  { code: "nl", name: "Dutch (Nederlands)" },
  { code: "pl", name: "Polish (Polski)" },
  { code: "sv", name: "Swedish (Svenska)" },
  { code: "no", name: "Norwegian (Norsk)" },
  { code: "da", name: "Danish (Dansk)" },
  { code: "fi", name: "Finnish (Suomi)" },
  { code: "tr", name: "Turkish (Türkçe)" },
  { code: "cs", name: "Czech (Čeština)" },
  { code: "hu", name: "Hungarian (Magyar)" },
  { code: "ro", name: "Romanian (Română)" },
  { code: "el", name: "Greek (Ελληνικά)" },
  { code: "he", name: "Hebrew (עברית)" },
  { code: "th", name: "Thai (ไทย)" },
  { code: "vi", name: "Vietnamese (Tiếng Việt)" },
  { code: "id", name: "Indonesian (Bahasa Indonesia)" },
  { code: "uk", name: "Ukrainian (Українська)" },
  { code: "ca", name: "Catalan (Català)" },
];

const LanguageOrderSelector = ({ value = [], onChange, label, helpText }) => {
  const [selectedLanguages, setSelectedLanguages] = useState([]);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Initialize from value prop
  useEffect(() => {
    if (Array.isArray(value) && value.length > 0) {
      setSelectedLanguages(value);
    }
  }, [value]);

  // Get available languages (not yet selected)
  const availableLanguages = COMMON_LANGUAGES.filter(
    (lang) => !selectedLanguages.includes(lang.code)
  );

  const addLanguage = (langCode) => {
    const newLanguages = [...selectedLanguages, langCode];
    setSelectedLanguages(newLanguages);
    onChange(newLanguages);
    setDropdownOpen(false);
  };

  const removeLanguage = (langCode) => {
    const newLanguages = selectedLanguages.filter((code) => code !== langCode);
    setSelectedLanguages(newLanguages);
    onChange(newLanguages);
  };

  const handleDragStart = (index) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newLanguages = [...selectedLanguages];
    const draggedItem = newLanguages[draggedIndex];
    newLanguages.splice(draggedIndex, 1);
    newLanguages.splice(index, 0, draggedItem);

    setSelectedLanguages(newLanguages);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null) {
      onChange(selectedLanguages);
    }
    setDraggedIndex(null);
  };

  const moveUp = (index) => {
    if (index === 0) return;
    const newLanguages = [...selectedLanguages];
    [newLanguages[index - 1], newLanguages[index]] = [
      newLanguages[index],
      newLanguages[index - 1],
    ];
    setSelectedLanguages(newLanguages);
    onChange(newLanguages);
  };

  const moveDown = (index) => {
    if (index === selectedLanguages.length - 1) return;
    const newLanguages = [...selectedLanguages];
    [newLanguages[index], newLanguages[index + 1]] = [
      newLanguages[index + 1],
      newLanguages[index],
    ];
    setSelectedLanguages(newLanguages);
    onChange(newLanguages);
  };

  const getLanguageName = (code) => {
    const lang = COMMON_LANGUAGES.find((l) => l.code === code);
    return lang ? lang.name : code.toUpperCase();
  };

  return (
    <div className="space-y-3">
      {label && (
        <label className="block text-sm font-medium text-theme-text">
          {label}
        </label>
      )}

      {/* Selected Languages - Draggable List */}
      <div className="space-y-2">
        {selectedLanguages.length === 0 ? (
          <div className="px-4 py-8 bg-theme-bg/50 border-2 border-dashed border-theme rounded-lg text-center">
            <p className="text-theme-muted text-sm">
              No languages selected. Add languages using the dropdown below.
            </p>
          </div>
        ) : (
          selectedLanguages.map((langCode, index) => (
            <div
              key={langCode}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 px-4 py-3 bg-theme-bg border border-theme rounded-lg hover:border-theme-primary/50 transition-all cursor-move ${
                draggedIndex === index ? "opacity-50" : ""
              }`}
            >
              {/* Drag Handle */}
              <GripVertical className="w-5 h-5 text-theme-muted flex-shrink-0" />

              {/* Priority Badge */}
              <div className="flex items-center justify-center w-8 h-8 bg-theme-primary/20 text-theme-primary rounded-full font-bold text-sm flex-shrink-0">
                {index + 1}
              </div>

              {/* Language Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-theme-primary font-semibold">
                    {langCode}
                  </span>
                  <span className="text-sm text-theme-muted">•</span>
                  <span className="text-sm text-theme-text truncate">
                    {getLanguageName(langCode)}
                  </span>
                </div>
              </div>

              {/* Arrow Buttons */}
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className={`p-1.5 rounded transition-all ${
                    index === 0
                      ? "text-theme-muted/30 cursor-not-allowed"
                      : "text-theme-muted hover:text-theme-primary hover:bg-theme-primary/10"
                  }`}
                  title="Move up"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === selectedLanguages.length - 1}
                  className={`p-1.5 rounded transition-all ${
                    index === selectedLanguages.length - 1
                      ? "text-theme-muted/30 cursor-not-allowed"
                      : "text-theme-muted hover:text-theme-primary hover:bg-theme-primary/10"
                  }`}
                  title="Move down"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>

              {/* Remove Button */}
              <button
                onClick={() => removeLanguage(langCode)}
                className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-all flex-shrink-0"
                title="Remove language"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add Language Dropdown */}
      {availableLanguages.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-theme-primary/20 hover:bg-theme-primary/30 border border-theme-primary/30 rounded-lg font-medium transition-all"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span className="text-sm">Add Language</span>
            </div>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                dropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />

              {/* Dropdown Content */}
              <div className="absolute z-20 w-full mt-2 bg-theme-bg border border-theme rounded-lg shadow-xl max-h-64 overflow-y-auto">
                {availableLanguages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => addLanguage(lang.code)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-theme-hover transition-all text-left"
                  >
                    <span className="font-mono text-sm text-theme-primary font-semibold w-8">
                      {lang.code}
                    </span>
                    <span className="text-sm text-theme-muted">•</span>
                    <span className="text-sm text-theme-text">{lang.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Help Text */}
      {helpText && <p className="text-xs text-theme-muted">{helpText}</p>}

      {/* Order Summary */}
      {selectedLanguages.length > 0 && (
        <div className="px-4 py-3 bg-theme-bg/50 border border-theme rounded-lg">
          <p className="text-xs text-theme-muted mb-1">Current Order:</p>
          <p className="text-sm font-mono text-theme-text">
            {selectedLanguages.join(", ")}
          </p>
        </div>
      )}
    </div>
  );
};

export default LanguageOrderSelector;
