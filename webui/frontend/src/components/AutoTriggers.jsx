import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Zap,
  Activity,
  Tv,
  Film,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Code,
  Terminal,
  Server,
  Settings,
  FileCode,
  Info,
  Copy,
  Check,
} from "lucide-react";

function AutoTriggers() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("tautulli");
  const [copiedCode, setCopiedCode] = useState(null);
  const [expandedStep, setExpandedStep] = useState(null);

  const tabs = [
    {
      id: "tautulli",
      label: "Tautulli",
      icon: Activity,
      description: t("autoTriggers.tabs.tautulli.description"),
    },
    {
      id: "sonarr",
      label: "Sonarr",
      icon: Tv,
      description: t("autoTriggers.tabs.sonarr.description"),
    },
    {
      id: "radarr",
      label: "Radarr",
      icon: Film,
      description: t("autoTriggers.tabs.radarr.description"),
    },
  ];

  const handleCopyCode = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="px-4 py-6 space-y-8">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex justify-center gap-4 mb-4">
          <img src="/sonarr.png" alt="Sonarr" className="h-16 w-auto" />
          <img src="/radarr.png" alt="Radarr" className="h-16 w-auto" />
          <img src="/tautulli.png" alt="Tautulli" className="h-16 w-auto" />
        </div>
        <h1 className="text-4xl font-bold text-theme-text mb-4">
          {t("autoTriggers.header.title")}
        </h1>
        <p className="text-xl text-theme-muted max-w-3xl mx-auto">
          {t("autoTriggers.header.subtitle")}
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-theme-card border border-theme rounded-lg p-2">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const logoMap = {
              tautulli: "/tautulli2.png",
              sonarr: "/sonarr.png",
              radarr: "/radarr.png",
            };

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`p-4 rounded-lg transition-all duration-300 ${
                  isActive
                    ? "bg-theme-primary text-white shadow-lg shadow-theme-primary/20"
                    : "bg-theme-hover text-theme-muted hover:bg-theme-hover hover:text-theme-text"
                }`}
              >
                <div className="flex items-center justify-center gap-3 mb-2">
                  <img
                    src={logoMap[tab.id]}
                    alt={tab.label}
                    className="w-6 h-6 object-contain"
                  />
                  <span className="font-semibold text-lg">{tab.label}</span>
                </div>
                <p className="text-xs opacity-80">{tab.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === "tautulli" && <TautulliContent />}
        {activeTab === "sonarr" && <SonarrContent />}
        {activeTab === "radarr" && <RadarrContent />}
      </div>
    </div>
  );
}

// Tautulli Content Component
function TautulliContent() {
  const { t } = useTranslation();
  const [mode, setMode] = useState("docker");
  const [copiedCode, setCopiedCode] = useState(null);
  const [expandedStep, setExpandedStep] = useState(null);

  const handleCopyCode = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const dockerSteps = t("autoTriggers.tautulli.docker.steps", {
    returnObjects: true,
  });
  const windowsSteps = t("autoTriggers.tautulli.windows.steps", {
    returnObjects: true,
  });

  const steps = mode === "docker" ? dockerSteps : windowsSteps;

  return (
    <div className="space-y-6">
      {/* Mode Switcher */}
      <div className="bg-theme-card border border-theme rounded-lg p-6">
        <h2 className="text-xl font-bold text-theme-text mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-theme-primary" />
          {t("autoTriggers.tautulli.selectMode")}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => setMode("docker")}
            className={`p-5 rounded-lg border-2 transition-all duration-300 ${
              mode === "docker"
                ? "border-theme-primary bg-theme-primary/10"
                : "border-theme hover:border-theme-primary/50"
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div
                className={`w-8 h-8 ${
                  mode === "docker" ? "text-theme-primary" : "text-theme-muted"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338 0-.676.03-1.01.09-.248-1.827-1.66-2.66-1.775-2.742l-.353-.19-.23.352c-.331.498-.556 1.078-.62 1.68-.047.434-.014.87.1 1.289-.326.177-.77.34-1.486.388H.91a.9.9 0 00-.91.907c.002.864.245 1.71.705 2.455.47.774 1.155 1.41 1.98 1.844 1.02.53 2.15.794 3.29.77 5.74 0 9.956-2.64 11.963-7.476.776.01 2.463 0 3.327-1.633l.066-.186-.138-.103z" />
                </svg>
              </div>
              <span
                className={`font-semibold text-lg ${
                  mode === "docker" ? "text-theme-text" : "text-theme-muted"
                }`}
              >
                Docker
              </span>
            </div>
            <p className="text-sm text-theme-muted text-left">
              {t("autoTriggers.tautulli.docker.description")}
            </p>
          </button>

          <button
            onClick={() => setMode("windows")}
            className={`p-5 rounded-lg border-2 transition-all duration-300 ${
              mode === "windows"
                ? "border-theme-primary bg-theme-primary/10"
                : "border-theme hover:border-theme-primary/50"
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div
                className={`w-8 h-8 ${
                  mode === "windows" ? "text-theme-primary" : "text-theme-muted"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                </svg>
              </div>
              <span
                className={`font-semibold text-lg ${
                  mode === "windows" ? "text-theme-text" : "text-theme-muted"
                }`}
              >
                Windows
              </span>
            </div>
            <p className="text-sm text-theme-muted text-left">
              {t("autoTriggers.tautulli.windows.description")}
            </p>
          </button>
        </div>
      </div>

      {/* Requirements Alert */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 sm:p-4">
        <div className="flex items-start gap-2 sm:gap-3">
          <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-theme-text mb-1 text-sm sm:text-base">
              {t("autoTriggers.tautulli.requirements.title")}
            </h3>
            <p className="text-xs sm:text-sm text-theme-muted">
              {mode === "docker"
                ? t("autoTriggers.tautulli.requirements.docker")
                : t("autoTriggers.tautulli.requirements.windows")}
            </p>
          </div>
        </div>
      </div>

      {/* Setup Steps */}
      <div className="bg-theme-card border border-theme rounded-lg p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold text-theme-text mb-4 sm:mb-6 flex items-center gap-2">
          <FileCode className="w-5 h-5 sm:w-6 sm:h-6 text-theme-primary" />
          {t("autoTriggers.setupSteps")}
        </h2>

        <div className="space-y-3 sm:space-y-4">
          {steps.map((step, index) => {
            const isExpanded = expandedStep === index;
            const hasCode = step.code && step.code.length > 0;

            return (
              <div key={index} className="relative">
                {/* Connection Line */}
                {index < steps.length - 1 && (
                  <div className="absolute left-6 sm:left-8 top-16 sm:top-20 w-0.5 h-6 sm:h-8 bg-theme-border" />
                )}

                <div className="bg-theme-hover border border-theme rounded-lg p-3 sm:p-5">
                  <div
                    className={`flex items-start gap-3 sm:gap-4 ${
                      hasCode ? "cursor-pointer" : ""
                    }`}
                    onClick={() =>
                      hasCode && setExpandedStep(isExpanded ? null : index)
                    }
                  >
                    {/* Step Number */}
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg bg-theme-primary/10 border border-theme-primary/30 flex items-center justify-center relative">
                        <CheckCircle className="w-5 h-5 sm:w-7 sm:h-7 text-theme-primary" />
                        <div className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 w-5 h-5 sm:w-6 sm:h-6 bg-theme-primary rounded-full border-2 border-theme-card flex items-center justify-center">
                          <span className="text-[10px] sm:text-xs font-bold text-white">
                            {index + 1}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <h3 className="text-base sm:text-lg font-semibold text-theme-text break-words leading-tight flex-1">
                          {step.title}
                        </h3>
                        {hasCode && (
                          <ChevronRight
                            className={`w-4 h-4 sm:w-5 sm:h-5 text-theme-muted transition-transform duration-300 flex-shrink-0 mt-0.5 ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          />
                        )}
                      </div>
                      <p className="text-theme-muted text-xs sm:text-sm mb-2 sm:mb-3 break-words leading-relaxed">
                        {step.description}
                      </p>

                      {/* Warning if present */}
                      {step.warning && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 sm:p-3 mb-2 sm:mb-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs sm:text-sm text-theme-text break-words leading-relaxed">
                              {step.warning}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Info if present */}
                      {step.info && (
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2 sm:p-3 mb-2 sm:mb-3">
                          <div className="flex items-start gap-2">
                            <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs sm:text-sm text-theme-text break-words leading-relaxed">
                              {step.info}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Code Blocks */}
                      {hasCode && isExpanded && (
                        <div className="space-y-2 sm:space-y-3 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-theme">
                          {step.code.map((codeBlock, codeIndex) => (
                            <div
                              key={codeIndex}
                              className="space-y-1.5 sm:space-y-2"
                            >
                              {codeBlock.label && (
                                <p className="text-xs sm:text-sm font-medium text-theme-text break-words">
                                  {codeBlock.label}
                                </p>
                              )}
                              <div className="relative">
                                <pre className="bg-theme-darker border border-theme rounded-lg p-3 sm:p-4 overflow-x-auto text-xs sm:text-sm text-theme-text">
                                  <code className="break-all">
                                    {codeBlock.content}
                                  </code>
                                </pre>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyCode(
                                      codeBlock.content,
                                      `${index}-${codeIndex}`
                                    );
                                  }}
                                  className="absolute top-2 right-2 p-1.5 sm:p-2 rounded-lg bg-theme-card hover:bg-theme-hover transition-colors"
                                  title={t("autoTriggers.copyCode")}
                                >
                                  {copiedCode === `${index}-${codeIndex}` ? (
                                    <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-muted" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Sub-steps if present */}
                      {step.substeps && (
                        <div className="space-y-1.5 sm:space-y-2 mt-2 sm:mt-3 pl-3 sm:pl-4 border-l-2 border-theme-primary/30">
                          {step.substeps.map((substep, subIndex) => (
                            <div
                              key={subIndex}
                              className="flex items-start gap-2"
                            >
                              <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary flex-shrink-0 mt-0.5" />
                              <span className="text-xs sm:text-sm text-theme-text break-words leading-relaxed">
                                {substep}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resources */}
      <div className="bg-theme-card border border-theme rounded-lg p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-bold text-theme-text mb-3 sm:mb-4 flex items-center gap-2">
          <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5 text-theme-primary" />
          {t("autoTriggers.resources.title")}
        </h3>
        <div className="space-y-2">
          <a
            href="https://github.com/Tautulli/Tautulli/wiki/Custom-Scripts"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-theme-primary hover:underline text-xs sm:text-sm break-all"
          >
            <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            {t("autoTriggers.resources.tautulliWiki")}
          </a>
          <a
            href="https://github.com/fscorrupt/posterizarr/blob/main/trigger.py"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-theme-primary hover:underline text-xs sm:text-sm break-all"
          >
            <Code className="w-4 h-4" />
            {t("autoTriggers.resources.triggerScript")}
          </a>
        </div>
      </div>
    </div>
  );
}

// Sonarr Content Component
function SonarrContent() {
  const { t } = useTranslation();
  const [copiedCode, setCopiedCode] = useState(null);
  const [expandedStep, setExpandedStep] = useState(null);

  const handleCopyCode = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const steps = t("autoTriggers.sonarr.steps", { returnObjects: true });

  return (
    <div className="space-y-6">
      {/* Requirements Alert */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 sm:p-4">
        <div className="flex items-start gap-2 sm:gap-3">
          <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-theme-text mb-1 text-sm sm:text-base">
              {t("autoTriggers.sonarr.requirements.title")}
            </h3>
            <p className="text-xs sm:text-sm text-theme-muted">
              {t("autoTriggers.sonarr.requirements.description")}
            </p>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-theme-card border border-theme rounded-lg p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-bold text-theme-text mb-3 sm:mb-4 flex items-center gap-2">
          <Info className="w-4 h-4 sm:w-5 sm:h-5 text-theme-primary" />
          {t("autoTriggers.howItWorks")}
        </h2>
        <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm text-theme-muted">
          {t("autoTriggers.sonarr.howItWorks", { returnObjects: true }).map(
            (item, index) => (
              <div key={index} className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{item}</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Setup Steps */}
      <div className="bg-theme-card border border-theme rounded-lg p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold text-theme-text mb-4 sm:mb-6 flex items-center gap-2">
          <FileCode className="w-5 h-5 sm:w-6 sm:h-6 text-theme-primary" />
          {t("autoTriggers.setupSteps")}
        </h2>

        <div className="space-y-3 sm:space-y-4">
          {steps.map((step, index) => {
            const isExpanded = expandedStep === index;
            const hasCode = step.code && step.code.length > 0;

            return (
              <div key={index} className="relative">
                {/* Connection Line */}
                {index < steps.length - 1 && (
                  <div className="absolute left-6 sm:left-8 top-16 sm:top-20 w-0.5 h-6 sm:h-8 bg-theme-border" />
                )}

                <div className="bg-theme-hover border border-theme rounded-lg p-3 sm:p-5">
                  <div
                    className={`flex items-start gap-3 sm:gap-4 ${
                      hasCode ? "cursor-pointer" : ""
                    }`}
                    onClick={() =>
                      hasCode && setExpandedStep(isExpanded ? null : index)
                    }
                  >
                    {/* Step Number */}
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg bg-theme-primary/10 border border-theme-primary/30 flex items-center justify-center relative">
                        <CheckCircle className="w-5 h-5 sm:w-7 sm:h-7 text-theme-primary" />
                        <div className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 w-5 h-5 sm:w-6 sm:h-6 bg-theme-primary rounded-full border-2 border-theme-card flex items-center justify-center">
                          <span className="text-[10px] sm:text-xs font-bold text-white">
                            {index + 1}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <h3 className="text-base sm:text-lg font-semibold text-theme-text break-words leading-tight flex-1">
                          {step.title}
                        </h3>
                        {hasCode && (
                          <ChevronRight
                            className={`w-4 h-4 sm:w-5 sm:h-5 text-theme-muted transition-transform duration-300 flex-shrink-0 mt-0.5 ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          />
                        )}
                      </div>
                      <p className="text-theme-muted text-xs sm:text-sm mb-2 sm:mb-3 break-words leading-relaxed">
                        {step.description}
                      </p>

                      {/* Warning if present */}
                      {step.warning && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 sm:p-3 mb-2 sm:mb-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs sm:text-sm text-theme-text break-words leading-relaxed">
                              {step.warning}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Info if present */}
                      {step.info && (
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2 sm:p-3 mb-2 sm:mb-3">
                          <div className="flex items-start gap-2">
                            <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs sm:text-sm text-theme-text break-words leading-relaxed">
                              {step.info}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Code Blocks */}
                      {hasCode && isExpanded && (
                        <div className="space-y-2 sm:space-y-3 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-theme">
                          {step.code.map((codeBlock, codeIndex) => (
                            <div
                              key={codeIndex}
                              className="space-y-1.5 sm:space-y-2"
                            >
                              {codeBlock.label && (
                                <p className="text-xs sm:text-sm font-medium text-theme-text break-words">
                                  {codeBlock.label}
                                </p>
                              )}
                              <div className="relative">
                                <pre className="bg-theme-darker border border-theme rounded-lg p-3 sm:p-4 overflow-x-auto text-xs sm:text-sm text-theme-text">
                                  <code className="break-all">
                                    {codeBlock.content}
                                  </code>
                                </pre>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyCode(
                                      codeBlock.content,
                                      `${index}-${codeIndex}`
                                    );
                                  }}
                                  className="absolute top-2 right-2 p-1.5 sm:p-2 rounded-lg bg-theme-card hover:bg-theme-hover transition-colors"
                                  title={t("autoTriggers.copyCode")}
                                >
                                  {copiedCode === `${index}-${codeIndex}` ? (
                                    <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-muted" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Sub-steps if present */}
                      {step.substeps && (
                        <div className="space-y-1.5 sm:space-y-2 mt-2 sm:mt-3 pl-3 sm:pl-4 border-l-2 border-theme-primary/30">
                          {step.substeps.map((substep, subIndex) => (
                            <div
                              key={subIndex}
                              className="flex items-start gap-2"
                            >
                              <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary flex-shrink-0 mt-0.5" />
                              <span className="text-xs sm:text-sm text-theme-text break-words leading-relaxed">
                                {substep}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resources */}
      <div className="bg-theme-card border border-theme rounded-lg p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-bold text-theme-text mb-3 sm:mb-4 flex items-center gap-2">
          <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5 text-theme-primary" />
          {t("autoTriggers.resources.title")}
        </h3>
        <div className="space-y-2">
          <a
            href="https://wiki.servarr.com/sonarr/settings#connect"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-theme-primary hover:underline text-xs sm:text-sm break-all"
          >
            <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            {t("autoTriggers.resources.sonarrWiki")}
          </a>
          <a
            href="https://github.com/fscorrupt/posterizarr/blob/main/ArrTrigger.sh"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-theme-primary hover:underline text-xs sm:text-sm break-all"
          >
            <Code className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            {t("autoTriggers.resources.arrTriggerScript")}
          </a>
        </div>
      </div>
    </div>
  );
}

// Radarr Content Component (similar to Sonarr)
function RadarrContent() {
  const { t } = useTranslation();
  const [copiedCode, setCopiedCode] = useState(null);
  const [expandedStep, setExpandedStep] = useState(null);

  const handleCopyCode = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const steps = t("autoTriggers.radarr.steps", { returnObjects: true });

  return (
    <div className="space-y-6">
      {/* Requirements Alert */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 sm:p-4">
        <div className="flex items-start gap-2 sm:gap-3">
          <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-theme-text mb-1 text-sm sm:text-base">
              {t("autoTriggers.radarr.requirements.title")}
            </h3>
            <p className="text-xs sm:text-sm text-theme-muted">
              {t("autoTriggers.radarr.requirements.description")}
            </p>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-theme-card border border-theme rounded-lg p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-bold text-theme-text mb-3 sm:mb-4 flex items-center gap-2">
          <Info className="w-4 h-4 sm:w-5 sm:h-5 text-theme-primary" />
          {t("autoTriggers.howItWorks")}
        </h2>
        <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm text-theme-muted">
          {t("autoTriggers.radarr.howItWorks", { returnObjects: true }).map(
            (item, index) => (
              <div key={index} className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{item}</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Setup Steps */}
      <div className="bg-theme-card border border-theme rounded-lg p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold text-theme-text mb-4 sm:mb-6 flex items-center gap-2">
          <FileCode className="w-5 h-5 sm:w-6 sm:h-6 text-theme-primary" />
          {t("autoTriggers.setupSteps")}
        </h2>

        <div className="space-y-3 sm:space-y-4">
          {steps.map((step, index) => {
            const isExpanded = expandedStep === index;
            const hasCode = step.code && step.code.length > 0;

            return (
              <div key={index} className="relative">
                {/* Connection Line */}
                {index < steps.length - 1 && (
                  <div className="absolute left-6 sm:left-8 top-16 sm:top-20 w-0.5 h-6 sm:h-8 bg-theme-border" />
                )}

                <div className="bg-theme-hover border border-theme rounded-lg p-3 sm:p-5">
                  <div
                    className={`flex items-start gap-3 sm:gap-4 ${
                      hasCode ? "cursor-pointer" : ""
                    }`}
                    onClick={() =>
                      hasCode && setExpandedStep(isExpanded ? null : index)
                    }
                  >
                    {/* Step Number */}
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg bg-theme-primary/10 border border-theme-primary/30 flex items-center justify-center relative">
                        <CheckCircle className="w-5 h-5 sm:w-7 sm:h-7 text-theme-primary" />
                        <div className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 w-5 h-5 sm:w-6 sm:h-6 bg-theme-primary rounded-full border-2 border-theme-card flex items-center justify-center">
                          <span className="text-[10px] sm:text-xs font-bold text-white">
                            {index + 1}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <h3 className="text-base sm:text-lg font-semibold text-theme-text break-words leading-tight flex-1">
                          {step.title}
                        </h3>
                        {hasCode && (
                          <ChevronRight
                            className={`w-4 h-4 sm:w-5 sm:h-5 text-theme-muted transition-transform duration-300 flex-shrink-0 mt-0.5 ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          />
                        )}
                      </div>
                      <p className="text-theme-muted text-xs sm:text-sm mb-2 sm:mb-3 break-words leading-relaxed">
                        {step.description}
                      </p>

                      {/* Warning if present */}
                      {step.warning && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 sm:p-3 mb-2 sm:mb-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs sm:text-sm text-theme-text break-words leading-relaxed">
                              {step.warning}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Info if present */}
                      {step.info && (
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2 sm:p-3 mb-2 sm:mb-3">
                          <div className="flex items-start gap-2">
                            <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs sm:text-sm text-theme-text break-words leading-relaxed">
                              {step.info}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Code Blocks */}
                      {hasCode && isExpanded && (
                        <div className="space-y-2 sm:space-y-3 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-theme">
                          {step.code.map((codeBlock, codeIndex) => (
                            <div
                              key={codeIndex}
                              className="space-y-1.5 sm:space-y-2"
                            >
                              {codeBlock.label && (
                                <p className="text-xs sm:text-sm font-medium text-theme-text break-words">
                                  {codeBlock.label}
                                </p>
                              )}
                              <div className="relative">
                                <pre className="bg-theme-darker border border-theme rounded-lg p-3 sm:p-4 overflow-x-auto text-xs sm:text-sm text-theme-text">
                                  <code className="break-all">
                                    {codeBlock.content}
                                  </code>
                                </pre>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyCode(
                                      codeBlock.content,
                                      `${index}-${codeIndex}`
                                    );
                                  }}
                                  className="absolute top-2 right-2 p-1.5 sm:p-2 rounded-lg bg-theme-card hover:bg-theme-hover transition-colors"
                                  title={t("autoTriggers.copyCode")}
                                >
                                  {copiedCode === `${index}-${codeIndex}` ? (
                                    <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-muted" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Sub-steps if present */}
                      {step.substeps && (
                        <div className="space-y-1.5 sm:space-y-2 mt-2 sm:mt-3 pl-3 sm:pl-4 border-l-2 border-theme-primary/30">
                          {step.substeps.map((substep, subIndex) => (
                            <div
                              key={subIndex}
                              className="flex items-start gap-2"
                            >
                              <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary flex-shrink-0 mt-0.5" />
                              <span className="text-xs sm:text-sm text-theme-text break-words leading-relaxed">
                                {substep}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resources */}
      <div className="bg-theme-card border border-theme rounded-lg p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-bold text-theme-text mb-3 sm:mb-4 flex items-center gap-2">
          <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5 text-theme-primary" />
          {t("autoTriggers.resources.title")}
        </h3>
        <div className="space-y-2">
          <a
            href="https://wiki.servarr.com/radarr/settings#connect"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-theme-primary hover:underline text-xs sm:text-sm break-all"
          >
            <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            {t("autoTriggers.resources.radarrWiki")}
          </a>
          <a
            href="https://github.com/fscorrupt/posterizarr/blob/main/ArrTrigger.sh"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-theme-primary hover:underline text-xs sm:text-sm break-all"
          >
            <Code className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            {t("autoTriggers.resources.arrTriggerScript")}
          </a>
        </div>
      </div>
    </div>
  );
}

export default AutoTriggers;
