import React, { useState, useEffect } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

function ScrollToButtons() {
  const [showButtons, setShowButtons] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;

      // Show buttons when scrolled more than 300px from top
      setShowButtons(scrollTop > 300);

      // Check if at top or bottom
      setAtTop(scrollTop < 100);
      setAtBottom(scrollTop + clientHeight >= scrollHeight - 100);
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll(); // Initial check

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const scrollToBottom = () => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  };

  if (!showButtons) return null;

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-40">
      {!atTop && (
        <button
          onClick={scrollToTop}
          className="p-3 bg-theme-primary hover:bg-theme-primary/90 text-white rounded-full shadow-lg hover:shadow-xl transition-all transform hover:scale-110"
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          <ArrowUp className="w-6 h-6" />
        </button>
      )}
      {!atBottom && (
        <button
          onClick={scrollToBottom}
          className="p-3 bg-theme-primary hover:bg-theme-primary/90 text-white rounded-full shadow-lg hover:shadow-xl transition-all transform hover:scale-110"
          title="Scroll to bottom"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

export default ScrollToButtons;
