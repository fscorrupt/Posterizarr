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
    <div className="min-h-screen w-full bg-gradient-to-br from-theme-dark via-theme-darker to-theme-dark flex items-center justify-center px-4">
      <div className="text-center">
        {/* Sonarr-style spinning radar */}
        <div className="relative w-32 h-32 mx-auto mb-8">
          {/* Outer ring */}
          <div className="absolute inset-0 border-4 border-theme-primary/20 rounded-full"></div>

          {/* Middle ring */}
          <div className="absolute inset-4 border-4 border-theme-primary/40 rounded-full"></div>

          {/* Inner ring */}
          <div className="absolute inset-8 border-4 border-theme-primary/60 rounded-full"></div>

          {/* Center dot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 bg-theme-primary rounded-full"></div>
          </div>

          {/* Rotating radar line */}
          <div
            className="absolute inset-0 animate-spin"
            style={{ animationDuration: "2s" }}
          >
            <div className="absolute top-1/2 left-1/2 w-16 h-0.5 bg-gradient-to-r from-theme-primary to-transparent transform -translate-y-1/2 origin-left"></div>
          </div>

          {/* Pulsing outer glow */}
          <div className="absolute inset-0 border-4 border-theme-primary rounded-full animate-ping opacity-20"></div>
        </div>

        {/* Loading message */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-theme-text">
            {message}
            <span className="inline-block w-8 text-left text-theme-primary">
              {dots}
            </span>
          </h2>

          {/* Progress bar */}
          <div className="w-80 max-w-full mx-auto h-2 bg-theme-darker rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-theme-primary to-theme-primary/60 animate-pulse"
              style={{
                width: "100%",
                animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
              }}
            ></div>
          </div>

          <p className="text-sm text-theme-muted mt-4">
            Initializing Posterizarr...
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoadingScreen;
