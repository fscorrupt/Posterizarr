/**
 * Get responsive grid column classes based on image size setting
 * @param {number} size - Size value from 1 (largest) to 5 (smallest)
 * @param {boolean} isPortrait - True for portrait images (posters/seasons), false for landscape (backgrounds/titlecards)
 * @returns {string} Tailwind CSS grid column classes
 */
export const getGridColumns = (size, isPortrait = true) => {
  if (isPortrait) {
    // Portrait images (2:3 aspect ratio) - Posters & Seasons
    switch (size) {
      case 1: // Very large
        return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3";
      case 2: // Large
        return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4";
      case 3: // Medium (default)
        return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
      case 4: // Small
        return "grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
      case 5: // Very small
        return "grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8";
      default:
        return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
    }
  } else {
    // Landscape images (16:9 aspect ratio) - Backgrounds & TitleCards
    switch (size) {
      case 1: // Very large
        return "grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2";
      case 2: // Large
        return "grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3";
      case 3: // Medium (default)
        return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
      case 4: // Small
        return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
      case 5: // Very small
        return "grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6";
      default:
        return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
    }
  }
};

/**
 * Load image size from localStorage with default fallback
 * @param {string} storageKey - localStorage key
 * @param {number} defaultSize - Default size value (typically 3)
 * @returns {number} Size value from 1-5
 */
export const loadImageSize = (storageKey, defaultSize = 3) => {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = parseInt(stored);
      if (parsed >= 1 && parsed <= 5) {
        return parsed;
      }
    }
  } catch (error) {
    console.error("Error loading image size from localStorage:", error);
  }
  return defaultSize;
};
