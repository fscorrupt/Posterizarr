import React from "react";
import { ZoomIn, ZoomOut } from "lucide-react";

/**
 * ImageSizeSlider - A reusable component for controlling image grid size
 * @param {Object} props
 * @param {number} props.value - Current size value (1-5)
 * @param {function} props.onChange - Callback when size changes
 * @param {string} props.storageKey - localStorage key for persistence
 */
function ImageSizeSlider({ value, onChange, storageKey }) {
  const handleChange = (e) => {
    const newValue = parseInt(e.target.value);
    onChange(newValue);
    // Save to localStorage if key provided
    if (storageKey) {
      localStorage.setItem(storageKey, newValue.toString());
    }
  };

  return (
    <div className="flex items-center gap-4 bg-theme-card border border-theme rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <ZoomOut className="w-5 h-5 text-theme-muted" />
        <span className="text-sm font-medium text-theme-muted whitespace-nowrap">
          Bildgröße
        </span>
      </div>

      <div className="flex-1 flex items-center gap-3">
        <input
          type="range"
          min="1"
          max="5"
          value={value}
          onChange={handleChange}
          className="flex-1 h-2 bg-theme-bg rounded-lg appearance-none cursor-pointer slider-thumb"
          style={{
            background: `linear-gradient(to right, var(--theme-primary) 0%, var(--theme-primary) ${
              ((value - 1) / 4) * 100
            }%, var(--theme-bg) ${
              ((value - 1) / 4) * 100
            }%, var(--theme-bg) 100%)`,
          }}
        />
        <div className="flex items-center justify-center w-12 h-8 bg-theme-primary/20 rounded-lg">
          <span className="text-sm font-bold text-theme-primary">{value}</span>
        </div>
      </div>

      <ZoomIn className="w-5 h-5 text-theme-primary" />

      <style jsx>{`
        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--theme-primary);
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: all 0.2s;
        }

        .slider-thumb::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }

        .slider-thumb::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--theme-primary);
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: all 0.2s;
        }

        .slider-thumb::-moz-range-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </div>
  );
}

export default ImageSizeSlider;
