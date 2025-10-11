import React from "react";

/**
 * CompactImageSizeSlider - A minimal slider for controlling image grid size
 * Range: 2-10 columns
 * Hidden on mobile devices (mobile always uses 1-2 columns)
 * @param {Object} props
 * @param {number} props.value - Current size value (2-10)
 * @param {function} props.onChange - Callback when size changes
 * @param {string} props.storageKey - localStorage key for persistence
 */
function CompactImageSizeSlider({ value, onChange, storageKey }) {
  const handleChange = (e) => {
    const newValue = parseInt(e.target.value);
    onChange(newValue);
    // Save to localStorage if key provided
    if (storageKey) {
      localStorage.setItem(storageKey, newValue.toString());
    }
  };

  return (
    <div className="hidden md:flex items-center px-3 py-2 bg-theme-card border border-theme rounded-lg shadow-sm">
      <input
        type="range"
        min="2"
        max="10"
        value={value}
        onChange={handleChange}
        className="w-32 h-2 bg-theme-bg rounded-lg appearance-none cursor-pointer slider-thumb"
        style={{
          background: `linear-gradient(to right, var(--theme-primary) 0%, var(--theme-primary) ${
            ((value - 2) / 8) * 100
          }%, var(--theme-bg) ${
            ((value - 2) / 8) * 100
          }%, var(--theme-bg) 100%)`,
        }}
      />

      <style jsx>{`
        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--theme-primary);
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: all 0.2s;
        }

        .slider-thumb::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
        }

        .slider-thumb::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--theme-primary);
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: all 0.2s;
        }

        .slider-thumb::-moz-range-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </div>
  );
}

export default CompactImageSizeSlider;
