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
} from "lucide-react";

function HowItWorks() {
  const [expandedStep, setExpandedStep] = useState(null);

  const workflowSteps = [
    {
      id: 1,
      title: "Library Scanning",
      icon: Database,
      description:
        "Posterizarr autonomously scans your Plex, Jellyfin, or Emby server for libraries and media content.",
      details: [
        "Automatic library discovery",
        "Multi-version support (theatrical cuts, director's cuts)",
        "CSV export of media data",
        "Library exclusion options",
      ],
    },
    {
      id: 2,
      title: "Artwork Discovery",
      icon: Globe,
      description:
        "Searches multiple sources for high-quality artwork based on your language preferences.",
      details: [
        "Sources: Fanart.tv, TMDB, TVDB, Plex, IMDb",
        "Textless images prioritized",
        "Configurable language ordering",
        "Resolution filtering (2000x3000 posters, 3840x2160 backgrounds)",
      ],
    },
    {
      id: 3,
      title: "Image Processing",
      icon: Sparkles,
      description:
        "Transforms downloaded artwork with custom overlays, text, borders, and effects.",
      details: [
        "Automatic resizing to optimal dimensions",
        "Custom overlay application",
        "Text rendering with multiple fonts",
        "Border and gradient effects",
      ],
    },
    {
      id: 4,
      title: "Asset Organization",
      icon: Layers,
      description:
        "Organizes processed assets using Kometa-compatible folder structure for seamless integration.",
      details: [
        "Kometa folder structure support",
        "Library folder organization",
        "Manual asset path priority",
        "Asset cleanup for deleted media",
      ],
    },
    {
      id: 5,
      title: "Media Server Upload",
      icon: Upload,
      description:
        "Directly uploads finished artwork to your media server or stores for Kometa integration.",
      details: [
        "Direct upload to Plex/Jellyfin/Emby",
        "Smart hash validation to skip duplicates",
        "EXIF metadata tagging",
        "Existing asset upload support",
      ],
    },
  ];

  const supportedTypes = [
    {
      icon: FileImage,
      title: "Movie/Show Posters",
      description: "High-quality 2000x3000 posters",
    },
    {
      icon: Image,
      title: "Backgrounds",
      description: "Stunning 3840x2160 backgrounds",
    },
    {
      icon: Tv,
      title: "Season Posters",
      description: "Organized season artwork",
    },
    {
      icon: Film,
      title: "Title Cards",
      description: "Episode title cards in 16:9",
    },
  ];

  const keyFeatures = [
    {
      icon: Zap,
      title: "Multi-Source Discovery",
      text: "Searches Fanart.tv, TMDB, TVDB, Plex, and IMDb",
    },
    {
      icon: Palette,
      title: "Custom Overlays",
      text: "Apply borders, text, and gradient effects",
    },
    {
      icon: Shield,
      title: "Smart Filtering",
      text: "Resolution and language preference filtering",
    },
    {
      icon: RefreshCw,
      title: "Auto-Sync",
      text: "Sync artwork between media servers",
    },
    {
      icon: Layout,
      title: "Kometa Compatible",
      text: "Seamless integration with Kometa folder structure",
    },
    {
      icon: Server,
      title: "Cross-Platform",
      text: "Works on Docker, Linux, Windows, macOS, and ARM",
    },
  ];

  return (
    <div className="px-4 py-6 space-y-8">
      {/* Header */}
      <div className="bg-theme-card border border-theme rounded-lg p-8 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-theme-primary/10 border border-theme-primary/30 mb-2">
          <Layers className="w-8 h-8 text-theme-primary" />
        </div>
        <h1 className="text-3xl font-bold text-theme-text">How It Works</h1>
        <p className="text-base text-theme-muted max-w-3xl mx-auto">
          Posterizarr automates the entire process of creating and managing
          artwork for your media library. Here's how it transforms your media
          experience.
        </p>
      </div>

      {/* Workflow Steps */}
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-6">
        <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Zap className="w-6 h-6 text-theme-primary" />
          The Workflow
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
          Supported Asset Types
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
          Key Features
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

      {/* Getting Started CTA */}
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
        <h2 className="text-2xl font-bold text-theme-text text-center">
          Ready to Transform Your Library?
        </h2>
        <p className="text-theme-muted text-center">
          Posterizarr handles everything from artwork discovery to media server
          upload, giving you beautiful, consistent artwork across your entire
          collection.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <a
            href="https://github.com/fscorrupt/Posterizarr/blob/main/walkthrough.md"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 bg-theme-primary hover:bg-theme-primary-hover text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
          >
            View Installation Guide
            <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="https://github.com/fscorrupt/Posterizarr#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 bg-theme-hover hover:bg-theme-primary/20 text-theme-text rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 border border-theme"
          >
            View on GitHub
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Technical Details */}
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
        <h3 className="text-xl font-bold text-theme-text flex items-center gap-2">
          <Server className="w-6 h-6 text-theme-primary" />
          Technical Highlights
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
              <span className="text-theme-text">
                <strong>Smart Caching:</strong> Only creates missing artwork,
                skipping existing assets
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
              <span className="text-theme-text">
                <strong>Hash Validation:</strong> Prevents duplicate uploads
                using EXIF metadata
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
              <span className="text-theme-text">
                <strong>RTL Support:</strong> Right-to-left font rendering for
                Arabic & Hebrew
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
              <span className="text-theme-text">
                <strong>Backup Mode:</strong> Download and backup all existing
                Plex artwork
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
              <span className="text-theme-text">
                <strong>Automated Cleanup:</strong> Removes assets when media is
                deleted
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
              <span className="text-theme-text">
                <strong>Multiple Triggers:</strong> Tautulli, Sonarr, Radarr
                integration
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HowItWorks;
