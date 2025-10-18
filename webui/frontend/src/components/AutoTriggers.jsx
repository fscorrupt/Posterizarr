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
        <div className="flex justify-center mb-4">
          <div className="w-20 h-20 rounded-2xl bg-theme-primary/10 border-2 border-theme-primary/30 flex items-center justify-center">
            <Zap className="w-10 h-10 text-theme-primary" />
          </div>
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
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

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
                  <Icon className="w-5 h-5" />
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
              <Server
                className={`w-6 h-6 ${
                  mode === "docker" ? "text-theme-primary" : "text-theme-muted"
                }`}
              />
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
              <Terminal
                className={`w-6 h-6 ${
                  mode === "windows" ? "text-theme-primary" : "text-theme-muted"
                }`}
              />
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
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-theme-text mb-1">
              {t("autoTriggers.tautulli.requirements.title")}
            </h3>
            <p className="text-sm text-theme-muted">
              {mode === "docker"
                ? t("autoTriggers.tautulli.requirements.docker")
                : t("autoTriggers.tautulli.requirements.windows")}
            </p>
          </div>
        </div>
      </div>

      {/* Setup Steps */}
      <div className="bg-theme-card border border-theme rounded-lg p-6">
        <h2 className="text-2xl font-bold text-theme-text mb-6 flex items-center gap-2">
          <FileCode className="w-6 h-6 text-theme-primary" />
          {t("autoTriggers.setupSteps")}
        </h2>

        <div className="space-y-4">
          {steps.map((step, index) => {
            const isExpanded = expandedStep === index;
            const hasCode = step.code && step.code.length > 0;

            return (
              <div key={index} className="relative">
                {/* Connection Line */}
                {index < steps.length - 1 && (
                  <div className="absolute left-8 top-20 w-0.5 h-8 bg-theme-border" />
                )}

                <div className="bg-theme-hover border border-theme rounded-lg p-5">
                  <div
                    className={`flex items-start gap-4 ${
                      hasCode ? "cursor-pointer" : ""
                    }`}
                    onClick={() =>
                      hasCode && setExpandedStep(isExpanded ? null : index)
                    }
                  >
                    {/* Step Number */}
                    <div className="flex-shrink-0">
                      <div className="w-16 h-16 rounded-lg bg-theme-primary/10 border border-theme-primary/30 flex items-center justify-center relative">
                        <CheckCircle className="w-7 h-7 text-theme-primary" />
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-theme-primary rounded-full border-2 border-theme-card flex items-center justify-center">
                          <span className="text-xs font-bold text-white">
                            {index + 1}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-theme-text">
                          {step.title}
                        </h3>
                        {hasCode && (
                          <ChevronRight
                            className={`w-5 h-5 text-theme-muted transition-transform duration-300 ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          />
                        )}
                      </div>
                      <p className="text-theme-muted text-sm mb-3">
                        {step.description}
                      </p>

                      {/* Warning if present */}
                      {step.warning && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-theme-text">
                              {step.warning}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Info if present */}
                      {step.info && (
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-3">
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-theme-text">
                              {step.info}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Code Blocks */}
                      {hasCode && isExpanded && (
                        <div className="space-y-3 mt-4 pt-4 border-t border-theme">
                          {step.code.map((codeBlock, codeIndex) => (
                            <div key={codeIndex} className="space-y-2">
                              {codeBlock.label && (
                                <p className="text-sm font-medium text-theme-text">
                                  {codeBlock.label}
                                </p>
                              )}
                              <div className="relative">
                                <pre className="bg-theme-darker border border-theme rounded-lg p-4 overflow-x-auto text-sm text-theme-text">
                                  <code>{codeBlock.content}</code>
                                </pre>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyCode(
                                      codeBlock.content,
                                      `${index}-${codeIndex}`
                                    );
                                  }}
                                  className="absolute top-2 right-2 p-2 rounded-lg bg-theme-card hover:bg-theme-hover transition-colors"
                                  title={t("autoTriggers.copyCode")}
                                >
                                  {copiedCode === `${index}-${codeIndex}` ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <Copy className="w-4 h-4 text-theme-muted" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Sub-steps if present */}
                      {step.substeps && (
                        <div className="space-y-2 mt-3 pl-4 border-l-2 border-theme-primary/30">
                          {step.substeps.map((substep, subIndex) => (
                            <div
                              key={subIndex}
                              className="flex items-start gap-2"
                            >
                              <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
                              <span className="text-sm text-theme-text">
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
      <div className="bg-theme-card border border-theme rounded-lg p-6">
        <h3 className="text-lg font-bold text-theme-text mb-4 flex items-center gap-2">
          <ExternalLink className="w-5 h-5 text-theme-primary" />
          {t("autoTriggers.resources.title")}
        </h3>
        <div className="space-y-2">
          <a
            href="https://github.com/Tautulli/Tautulli/wiki/Custom-Scripts"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-theme-primary hover:underline text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            {t("autoTriggers.resources.tautulliWiki")}
          </a>
          <a
            href="https://github.com/cyb3rgh05t/posterizarr/blob/main/trigger.py"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-theme-primary hover:underline text-sm"
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
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-theme-text mb-1">
              {t("autoTriggers.sonarr.requirements.title")}
            </h3>
            <p className="text-sm text-theme-muted">
              {t("autoTriggers.sonarr.requirements.description")}
            </p>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-theme-card border border-theme rounded-lg p-6">
        <h2 className="text-xl font-bold text-theme-text mb-4 flex items-center gap-2">
          <Info className="w-5 h-5 text-theme-primary" />
          {t("autoTriggers.howItWorks")}
        </h2>
        <div className="space-y-3 text-sm text-theme-muted">
          {t("autoTriggers.sonarr.howItWorks", { returnObjects: true }).map(
            (item, index) => (
              <div key={index} className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Setup Steps */}
      <div className="bg-theme-card border border-theme rounded-lg p-6">
        <h2 className="text-2xl font-bold text-theme-text mb-6 flex items-center gap-2">
          <FileCode className="w-6 h-6 text-theme-primary" />
          {t("autoTriggers.setupSteps")}
        </h2>

        <div className="space-y-4">
          {steps.map((step, index) => {
            const isExpanded = expandedStep === index;
            const hasCode = step.code && step.code.length > 0;

            return (
              <div key={index} className="relative">
                {/* Connection Line */}
                {index < steps.length - 1 && (
                  <div className="absolute left-8 top-20 w-0.5 h-8 bg-theme-border" />
                )}

                <div className="bg-theme-hover border border-theme rounded-lg p-5">
                  <div
                    className={`flex items-start gap-4 ${
                      hasCode ? "cursor-pointer" : ""
                    }`}
                    onClick={() =>
                      hasCode && setExpandedStep(isExpanded ? null : index)
                    }
                  >
                    {/* Step Number */}
                    <div className="flex-shrink-0">
                      <div className="w-16 h-16 rounded-lg bg-theme-primary/10 border border-theme-primary/30 flex items-center justify-center relative">
                        <CheckCircle className="w-7 h-7 text-theme-primary" />
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-theme-primary rounded-full border-2 border-theme-card flex items-center justify-center">
                          <span className="text-xs font-bold text-white">
                            {index + 1}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-theme-text">
                          {step.title}
                        </h3>
                        {hasCode && (
                          <ChevronRight
                            className={`w-5 h-5 text-theme-muted transition-transform duration-300 ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          />
                        )}
                      </div>
                      <p className="text-theme-muted text-sm mb-3">
                        {step.description}
                      </p>

                      {/* Warning if present */}
                      {step.warning && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-theme-text">
                              {step.warning}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Info if present */}
                      {step.info && (
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-3">
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-theme-text">
                              {step.info}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Code Blocks */}
                      {hasCode && isExpanded && (
                        <div className="space-y-3 mt-4 pt-4 border-t border-theme">
                          {step.code.map((codeBlock, codeIndex) => (
                            <div key={codeIndex} className="space-y-2">
                              {codeBlock.label && (
                                <p className="text-sm font-medium text-theme-text">
                                  {codeBlock.label}
                                </p>
                              )}
                              <div className="relative">
                                <pre className="bg-theme-darker border border-theme rounded-lg p-4 overflow-x-auto text-sm text-theme-text">
                                  <code>{codeBlock.content}</code>
                                </pre>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyCode(
                                      codeBlock.content,
                                      `${index}-${codeIndex}`
                                    );
                                  }}
                                  className="absolute top-2 right-2 p-2 rounded-lg bg-theme-card hover:bg-theme-hover transition-colors"
                                  title={t("autoTriggers.copyCode")}
                                >
                                  {copiedCode === `${index}-${codeIndex}` ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <Copy className="w-4 h-4 text-theme-muted" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Sub-steps if present */}
                      {step.substeps && (
                        <div className="space-y-2 mt-3 pl-4 border-l-2 border-theme-primary/30">
                          {step.substeps.map((substep, subIndex) => (
                            <div
                              key={subIndex}
                              className="flex items-start gap-2"
                            >
                              <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
                              <span className="text-sm text-theme-text">
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
      <div className="bg-theme-card border border-theme rounded-lg p-6">
        <h3 className="text-lg font-bold text-theme-text mb-4 flex items-center gap-2">
          <ExternalLink className="w-5 h-5 text-theme-primary" />
          {t("autoTriggers.resources.title")}
        </h3>
        <div className="space-y-2">
          <a
            href="https://wiki.servarr.com/sonarr/settings#connect"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-theme-primary hover:underline text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            {t("autoTriggers.resources.sonarrWiki")}
          </a>
          <a
            href="https://github.com/cyb3rgh05t/posterizarr/blob/main/ArrTrigger.sh"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-theme-primary hover:underline text-sm"
          >
            <Code className="w-4 h-4" />
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
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-theme-text mb-1">
              {t("autoTriggers.radarr.requirements.title")}
            </h3>
            <p className="text-sm text-theme-muted">
              {t("autoTriggers.radarr.requirements.description")}
            </p>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-theme-card border border-theme rounded-lg p-6">
        <h2 className="text-xl font-bold text-theme-text mb-4 flex items-center gap-2">
          <Info className="w-5 h-5 text-theme-primary" />
          {t("autoTriggers.howItWorks")}
        </h2>
        <div className="space-y-3 text-sm text-theme-muted">
          {t("autoTriggers.radarr.howItWorks", { returnObjects: true }).map(
            (item, index) => (
              <div key={index} className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Setup Steps */}
      <div className="bg-theme-card border border-theme rounded-lg p-6">
        <h2 className="text-2xl font-bold text-theme-text mb-6 flex items-center gap-2">
          <FileCode className="w-6 h-6 text-theme-primary" />
          {t("autoTriggers.setupSteps")}
        </h2>

        <div className="space-y-4">
          {steps.map((step, index) => {
            const isExpanded = expandedStep === index;
            const hasCode = step.code && step.code.length > 0;

            return (
              <div key={index} className="relative">
                {/* Connection Line */}
                {index < steps.length - 1 && (
                  <div className="absolute left-8 top-20 w-0.5 h-8 bg-theme-border" />
                )}

                <div className="bg-theme-hover border border-theme rounded-lg p-5">
                  <div
                    className={`flex items-start gap-4 ${
                      hasCode ? "cursor-pointer" : ""
                    }`}
                    onClick={() =>
                      hasCode && setExpandedStep(isExpanded ? null : index)
                    }
                  >
                    {/* Step Number */}
                    <div className="flex-shrink-0">
                      <div className="w-16 h-16 rounded-lg bg-theme-primary/10 border border-theme-primary/30 flex items-center justify-center relative">
                        <CheckCircle className="w-7 h-7 text-theme-primary" />
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-theme-primary rounded-full border-2 border-theme-card flex items-center justify-center">
                          <span className="text-xs font-bold text-white">
                            {index + 1}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-theme-text">
                          {step.title}
                        </h3>
                        {hasCode && (
                          <ChevronRight
                            className={`w-5 h-5 text-theme-muted transition-transform duration-300 ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          />
                        )}
                      </div>
                      <p className="text-theme-muted text-sm mb-3">
                        {step.description}
                      </p>

                      {/* Warning if present */}
                      {step.warning && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-theme-text">
                              {step.warning}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Info if present */}
                      {step.info && (
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-3">
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-theme-text">
                              {step.info}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Code Blocks */}
                      {hasCode && isExpanded && (
                        <div className="space-y-3 mt-4 pt-4 border-t border-theme">
                          {step.code.map((codeBlock, codeIndex) => (
                            <div key={codeIndex} className="space-y-2">
                              {codeBlock.label && (
                                <p className="text-sm font-medium text-theme-text">
                                  {codeBlock.label}
                                </p>
                              )}
                              <div className="relative">
                                <pre className="bg-theme-darker border border-theme rounded-lg p-4 overflow-x-auto text-sm text-theme-text">
                                  <code>{codeBlock.content}</code>
                                </pre>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyCode(
                                      codeBlock.content,
                                      `${index}-${codeIndex}`
                                    );
                                  }}
                                  className="absolute top-2 right-2 p-2 rounded-lg bg-theme-card hover:bg-theme-hover transition-colors"
                                  title={t("autoTriggers.copyCode")}
                                >
                                  {copiedCode === `${index}-${codeIndex}` ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <Copy className="w-4 h-4 text-theme-muted" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Sub-steps if present */}
                      {step.substeps && (
                        <div className="space-y-2 mt-3 pl-4 border-l-2 border-theme-primary/30">
                          {step.substeps.map((substep, subIndex) => (
                            <div
                              key={subIndex}
                              className="flex items-start gap-2"
                            >
                              <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
                              <span className="text-sm text-theme-text">
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
      <div className="bg-theme-card border border-theme rounded-lg p-6">
        <h3 className="text-lg font-bold text-theme-text mb-4 flex items-center gap-2">
          <ExternalLink className="w-5 h-5 text-theme-primary" />
          {t("autoTriggers.resources.title")}
        </h3>
        <div className="space-y-2">
          <a
            href="https://wiki.servarr.com/radarr/settings#connect"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-theme-primary hover:underline text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            {t("autoTriggers.resources.radarrWiki")}
          </a>
          <a
            href="https://github.com/cyb3rgh05t/posterizarr/blob/main/ArrTrigger.sh"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-theme-primary hover:underline text-sm"
          >
            <Code className="w-4 h-4" />
            {t("autoTriggers.resources.arrTriggerScript")}
          </a>
        </div>
      </div>
    </div>
  );
}

export default AutoTriggers;
