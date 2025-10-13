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
      {/* Posterizarr Logo */}
      <div className="mb-8">
        <img 
          src="/favicon.png" 
          alt="Posterizarr Logo" 
          className="w-24 h-24 object-contain"
        />
      </div>

      {/* Radarr-style spinning radar - smaller and at top */}
      <div className="relative w-20 h-20 mb-8">
        {/* Outer ring */}
        <div className="absolute inset-0 border-2 border-theme-primary/20 rounded-full"></div>

        {/* Middle ring */}
        <div className="absolute inset-2 border-2 border-theme-primary/40 rounded-full"></div>

        {/* Inner ring */}
        <div className="absolute inset-4 border-2 border-theme-primary/60 rounded-full"></div>

        {/* Center dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 bg-theme-primary rounded-full"></div>
        </div>

        {/* Rotating radar line */}
        <div
          className="absolute inset-0 animate-spin"
          style={{ animationDuration: "1.5s" }}
        >
          <div className="absolute top-1/2 left-1/2 w-10 h-0.5 bg-gradient-to-r from-theme-primary to-transparent transform -translate-y-1/2 origin-left"></div>
        </div>

        {/* Pulsing outer glow */}
        <div className="absolute inset-0 border-2 border-theme-primary rounded-full animate-ping opacity-20"></div>
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
