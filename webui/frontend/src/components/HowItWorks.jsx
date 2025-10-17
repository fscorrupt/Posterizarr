import React, { useState } from "react";
import {
  Layers,
  Download,
  Image,
  Sparkles,
  Upload,
  Database,
  Zap,
  CheckCircle,
  ChevronRight,
  FileImage,
  Globe,
  Server,
  RefreshCw,
  Shield,
  Palette,
  Film,
  Tv,
  Layout,
  ArrowRight,
  Eye,
  ExternalLink,
} from "lucide-react";
import { useTranslation } from "react-i18next";

function HowItWorks() {
  const { t } = useTranslation();
  const [expandedStep, setExpandedStep] = useState(null);

  const workflowSteps = [
    {
      id: 1,
      title: t("howItWorks.steps.libraryScanning.title"),
      icon: Database,
      description: t("howItWorks.steps.libraryScanning.description"),
      details: t("howItWorks.steps.libraryScanning.details", {
        returnObjects: true,
      }),
    },
    {
      id: 2,
      title: t("howItWorks.steps.artworkDiscovery.title"),
      icon: Globe,
      description: t("howItWorks.steps.artworkDiscovery.description"),
      details: t("howItWorks.steps.artworkDiscovery.details", {
        returnObjects: true,
      }),
    },
    {
      id: 3,
      title: t("howItWorks.steps.imageProcessing.title"),
      icon: Sparkles,
      description: t("howItWorks.steps.imageProcessing.description"),
      details: t("howItWorks.steps.imageProcessing.details", {
        returnObjects: true,
      }),
    },
    {
      id: 4,
      title: t("howItWorks.steps.assetOrganization.title"),
      icon: Layers,
      description: t("howItWorks.steps.assetOrganization.description"),
      details: t("howItWorks.steps.assetOrganization.details", {
        returnObjects: true,
      }),
    },
    {
      id: 5,
      title: t("howItWorks.steps.mediaServerUpload.title"),
      icon: Upload,
      description: t("howItWorks.steps.mediaServerUpload.description"),
      details: t("howItWorks.steps.mediaServerUpload.details", {
        returnObjects: true,
      }),
    },
  ];

  const supportedTypes = [
    {
      icon: FileImage,
      title: t("howItWorks.assetTypes.posters.title"),
      description: t("howItWorks.assetTypes.posters.description"),
    },
    {
      icon: Image,
      title: t("howItWorks.assetTypes.backgrounds.title"),
      description: t("howItWorks.assetTypes.backgrounds.description"),
    },
    {
      icon: Tv,
      title: t("howItWorks.assetTypes.seasons.title"),
      description: t("howItWorks.assetTypes.seasons.description"),
    },
    {
      icon: Film,
      title: t("howItWorks.assetTypes.titleCards.title"),
      description: t("howItWorks.assetTypes.titleCards.description"),
    },
  ];

  const keyFeatures = [
    {
      icon: Zap,
      title: t("howItWorks.features.multiSource.title"),
      text: t("howItWorks.features.multiSource.text"),
    },
    {
      icon: Palette,
      title: t("howItWorks.features.customOverlays.title"),
      text: t("howItWorks.features.customOverlays.text"),
    },
    {
      icon: Shield,
      title: t("howItWorks.features.smartFiltering.title"),
      text: t("howItWorks.features.smartFiltering.text"),
    },
    {
      icon: RefreshCw,
      title: t("howItWorks.features.autoSync.title"),
      text: t("howItWorks.features.autoSync.text"),
    },
    {
      icon: Layout,
      title: t("howItWorks.features.kometaCompatible.title"),
      text: t("howItWorks.features.kometaCompatible.text"),
    },
    {
      icon: Server,
      title: t("howItWorks.features.crossPlatform.title"),
      text: t("howItWorks.features.crossPlatform.text"),
    },
  ];

  return (
    <div className="px-4 py-6 space-y-8">
      {/* Header */}
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex justify-center mb-4">
          <img src="/logo.png" alt="Posterizarr" className="h-15 w-auto" />
        </div>
        <h1 className="text-4xl font-bold text-theme-text mb-4">
          {t("howItWorks.header.title")}
        </h1>
        <p className="text-xl text-theme-muted max-w-3xl mx-auto">
          {t("howItWorks.header.subtitle")}
        </p>
      </div>

      {/* Workflow Steps */}
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-6">
        <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Zap className="w-6 h-6 text-theme-primary" />
          {t("howItWorks.workflow.title")}
        </h2>

        <div className="space-y-4">
          {workflowSteps.map((step, index) => {
            const Icon = step.icon;
            const isExpanded = expandedStep === step.id;

            return (
              <div key={step.id} className="relative">
                {/* Connection Line */}
                {index < workflowSteps.length - 1 && (
                  <div className="absolute left-8 top-20 w-0.5 h-8 bg-theme-border" />
                )}

                <div
                  className="bg-theme-hover border border-theme rounded-lg p-5 transition-all duration-300 cursor-pointer hover:border-theme-primary/50"
                  onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                >
                  <div className="flex items-start gap-4">
                    {/* Step Number & Icon */}
                    <div className="flex-shrink-0">
                      <div className="w-16 h-16 rounded-lg bg-theme-primary/10 border border-theme-primary/30 flex items-center justify-center relative">
                        <Icon className="w-7 h-7 text-theme-primary" />
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-theme-primary rounded-full border-2 border-theme-card flex items-center justify-center">
                          <span className="text-xs font-bold text-white">
                            {step.id}
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
                        <ChevronRight
                          className={`w-5 h-5 text-theme-muted transition-transform duration-300 ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                      </div>
                      <p className="text-theme-muted text-sm mb-3">
                        {step.description}
                      </p>

                      {/* Expandable Details */}
                      <div
                        className={`overflow-hidden transition-all duration-300 ${
                          isExpanded
                            ? "max-h-96 opacity-100 mt-4"
                            : "max-h-0 opacity-0"
                        }`}
                      >
                        <div className="space-y-2 pt-3 border-t border-theme">
                          {step.details.map((detail, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 text-sm text-theme-text"
                            >
                              <CheckCircle className="w-4 h-4 flex-shrink-0 text-theme-primary" />
                              <span>{detail}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Supported Asset Types */}
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-6">
        <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Image className="w-6 h-6 text-theme-primary" />
          {t("howItWorks.assetTypes.title")}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {supportedTypes.map((type, index) => {
            const Icon = type.icon;
            return (
              <div
                key={index}
                className="bg-theme-hover border border-theme rounded-lg p-4 hover:border-theme-primary/50 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-lg bg-theme-primary/10 border border-theme-primary/30 flex items-center justify-center mb-3">
                  <Icon className="w-6 h-6 text-theme-primary" />
                </div>
                <h3 className="font-semibold text-theme-text mb-1 text-sm">
                  {type.title}
                </h3>
                <p className="text-xs text-theme-muted">{type.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Key Features Grid */}
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-6">
        <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-theme-primary" />
          {t("howItWorks.features.title")}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {keyFeatures.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="bg-theme-hover border border-theme rounded-lg p-4 hover:border-theme-primary/50 transition-all duration-300 group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-theme-primary/10 border border-theme-primary/30 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
                    <Icon className="w-5 h-5 text-theme-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-theme-text mb-1 text-sm">
                      {feature.title}
                    </h3>
                    <p className="text-xs text-theme-muted">{feature.text}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Example Showcase */}
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-6">
        <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Eye className="w-6 h-6 text-theme-primary" />
          {t("howItWorks.showcase.title")}
        </h2>

        {/* Posterizarr Results */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-theme-text mb-3">
              {t("howItWorks.showcase.posterizarrOutput")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="group relative bg-theme-hover border border-theme rounded-lg overflow-hidden hover:border-theme-primary/50 transition-all">
                <img
                  src="https://raw.githubusercontent.com/fscorrupt/Posterizarr/main/images/posterizarr-overview.jpg"
                  alt="Posterizarr Overview - Original"
                  className="w-full h-auto object-contain group-hover:scale-[1.02] transition-transform duration-300"
                />
              </div>
              <div className="group relative bg-theme-hover border border-theme rounded-lg overflow-hidden hover:border-theme-primary/50 transition-all">
                <img
                  src="https://raw.githubusercontent.com/fscorrupt/Posterizarr/main/images/posterizarr-overview-new.jpg"
                  alt="Posterizarr Overview - Updated"
                  className="w-full h-auto object-contain group-hover:scale-[1.02] transition-transform duration-300"
                />
              </div>
            </div>
            <p className="text-sm text-theme-muted mt-3">
              {t("howItWorks.showcase.posterizarrDescription")}
            </p>
          </div>

          {/* Kometa Integration Results */}
          <div>
            <h3 className="text-lg font-semibold text-theme-text mb-3">
              {t("howItWorks.showcase.kometaIntegration")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="group relative bg-theme-hover border border-theme rounded-lg overflow-hidden hover:border-theme-primary/50 transition-all">
                <img
                  src="https://raw.githubusercontent.com/fscorrupt/Posterizarr/main/images/kometa-overview.png"
                  alt="Kometa Overview - Original"
                  className="w-full h-auto object-contain group-hover:scale-[1.02] transition-transform duration-300"
                />
              </div>
              <div className="group relative bg-theme-hover border border-theme rounded-lg overflow-hidden hover:border-theme-primary/50 transition-all">
                <img
                  src="https://raw.githubusercontent.com/fscorrupt/Posterizarr/main/images/kometa-overview-new.jpg"
                  alt="Kometa Overview - Updated"
                  className="w-full h-auto object-contain group-hover:scale-[1.02] transition-transform duration-300"
                />
              </div>
            </div>
            <p className="text-sm text-theme-muted mt-3">
              {t("howItWorks.showcase.kometaDescription")}
            </p>
          </div>
        </div>
      </div>

      {/* Getting Started CTA */}
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
        <h2 className="text-2xl font-bold text-theme-text text-center">
          {t("howItWorks.cta.title")}
        </h2>
        <p className="text-theme-muted text-center">
          {t("howItWorks.cta.description")}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <a
            href="https://github.com/fscorrupt/Posterizarr/blob/main/walkthrough.md"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 bg-theme-primary hover:bg-theme-primary-hover text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            {t("howItWorks.cta.installationGuide")}
            <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="https://github.com/fscorrupt/Posterizarr#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 bg-theme-hover hover:bg-theme-primary/20 text-theme-text rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 border border-theme"
          >
            {t("howItWorks.cta.viewOnGitHub")}
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Technical Details */}
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
        <h3 className="text-xl font-bold text-theme-text flex items-center gap-2">
          <Server className="w-6 h-6 text-theme-primary" />
          {t("howItWorks.technical.title")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
              <span
                className="text-theme-text"
                dangerouslySetInnerHTML={{
                  __html: t("howItWorks.technical.smartCaching"),
                }}
              />
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
              <span
                className="text-theme-text"
                dangerouslySetInnerHTML={{
                  __html: t("howItWorks.technical.hashValidation"),
                }}
              />
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
              <span
                className="text-theme-text"
                dangerouslySetInnerHTML={{
                  __html: t("howItWorks.technical.rtlSupport"),
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
              <span
                className="text-theme-text"
                dangerouslySetInnerHTML={{
                  __html: t("howItWorks.technical.backupMode"),
                }}
              />
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
              <span
                className="text-theme-text"
                dangerouslySetInnerHTML={{
                  __html: t("howItWorks.technical.automatedCleanup"),
                }}
              />
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
              <span
                className="text-theme-text"
                dangerouslySetInnerHTML={{
                  __html: t("howItWorks.technical.multipleTriggers"),
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HowItWorks;
