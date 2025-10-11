import React from "react";

/**
 * CompactImageSizeSlider - A minimal slider for controlling image grid size
 * Flexible range support via min/max props
 * Hidden on mobile devices (mobile always uses 1-2 columns)
 * @param {Object} props
 * @param {number} props.value - Current size value
 * @param {function} props.onChange - Callback when size changes
 * @param {string} props.storageKey - localStorage key for persistence (optional)
 * @param {number} props.min - Minimum value (default: 2)
 * @param {number} props.max - Maximum value (default: 10)
 */
function CompactImageSizeSlider({
  value,
  onChange,
  storageKey,
  min = 2,
  max = 10,
}) {
  const handleChange = (e) => {
    const newValue = parseInt(e.target.value);
    onChange(newValue);
    // Save to localStorage if key provided
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, newValue.toString());
      } catch (error) {
        console.warn("Failed to save to localStorage:", error);
      }
    }
  };

  // Calculate percentage for gradient
  const range = max - min;
  const percentage = ((value - min) / range) * 100;

  return (
    <div className="hidden md:flex items-center px-3 py-2 bg-theme-card border border-theme rounded-lg shadow-sm">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={handleChange}
        className="w-32 h-2 bg-white rounded-lg appearance-none cursor-pointer slider-thumb"
        style={{
          background: `linear-gradient(to right, var(--theme-primary) 0%, var(--theme-primary) ${percentage}%, white ${percentage}%, white 100%)`,
        }}
      />

      <style jsx>{`
        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--theme-primary);
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          transition: all 0.2s;
        }

        .slider-thumb::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 3px 6px rgba(0, 0, 0, 0.4);
        }

        .slider-thumb::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--theme-primary);
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          transition: all 0.2s;
        }

        .slider-thumb::-moz-range-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 3px 6px rgba(0, 0, 0, 0.4);
        }
      `}</style>
    </div>
  );
}

export default CompactImageSizeSlider;
