import React, { useState, useEffect } from "react";

const LOADING_MESSAGES = [
  "At least you're not on hold...",
  "Loading your posters with style...",
  "Convincing AI that your taste is impeccable...",
  "Asking the hamsters to run faster...",
  "Reticulating splines...",
  "Calibrating flux capacitor...",
  "Brewing fresh pixels...",
  "Waking up the server hamsters...",
  "Downloading more RAM...",
  "Polishing your movie collection...",
  "Teaching robots to appreciate art...",
  "Consulting the magic 8-ball...",
  "Summoning the poster spirits...",
  "Making it look effortless...",
  "99 little bugs in the code... wait, now 100...",
  "Time is an illusion. Loading time doubly so...",
  "Are we there yet?",
  "Patience, young padawan...",
  "Loading the loading screen...",
  "This is taking longer than expected...",
];

function LoadingScreen() {
  const [message, setMessage] = useState(
    LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]
  );
  const [dots, setDots] = useState("");

  // Change message every 3 seconds
  useEffect(() => {
    const messageInterval = setInterval(() => {
      const randomMessage =
        LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
      setMessage(randomMessage);
    }, 3000);

    return () => clearInterval(messageInterval);
  }, []);

  // Animated dots (...) every 500ms
  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots((prev) => {
        if (prev === "...") return "";
        return prev + ".";
      });
    }, 500);

    return () => clearInterval(dotsInterval);
  }, []);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-theme-dark via-theme-darker to-theme-dark flex flex-col items-center pt-32 px-4">
      <style>{`
        @keyframes ringPulse {
          0%, 100% {
            opacity: 0.2;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.1);
          }
        }
        .ring-pulse-1 {
          animation: ringPulse 2s ease-in-out infinite;
        }
        .ring-pulse-2 {
          animation: ringPulse 2s ease-in-out infinite;
          animation-delay: 0.2s;
        }
        .ring-pulse-3 {
          animation: ringPulse 2s ease-in-out infinite;
          animation-delay: 0.4s;
        }
      `}</style>
      {/* Posterizarr Logo */}
      <div className="mb-8">
        <img
          src="/logo.png"
          alt="Posterizarr Logo"
          className="h-12 w-auto object-contain"
        />
      </div>

      {/* Radarr-style spinning radar - smaller and at top */}
      <div className="relative w-12 h-12 mb-8">
        {/* Outer ring - pulsing */}
        <div className="absolute inset-0 border border-white rounded-full ring-pulse-1"></div>

        {/* Middle ring - pulsing with delay */}
        <div className="absolute inset-1 border border-white rounded-full ring-pulse-2"></div>

        {/* Inner ring - pulsing with delay */}
        <div className="absolute inset-2 border border-white rounded-full ring-pulse-3"></div>
      </div>

      {/* Loading message - Radarr style */}
      <div className="text-center space-y-3">
        <h2 className="text-xl font-semibold text-theme-text">
          {message}
          <span className="inline-block w-6 text-left text-theme-primary">
            {dots}
          </span>
        </h2>

        <p className="text-sm text-theme-muted">Initializing Posterizarr...</p>
      </div>
    </div>
  );
}

export default LoadingScreen;
