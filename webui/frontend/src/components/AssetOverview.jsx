import React, { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  Globe,
  Database,
  Type,
  Edit,
  FileQuestion,
  RefreshCw,
  Search,
  Replace,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import AssetReplacer from "./AssetReplacer";

const AssetOverview = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("All Types");
  const [selectedLibrary, setSelectedLibrary] = useState("All Libraries");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [showReplacer, setShowReplacer] = useState(false);

  // Fetch data from API
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/assets/overview");
      if (!response.ok) throw new Error(t("assetOverview.fetchError"));
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle opening the replacer
  const handleReplace = async (asset) => {
    // Instead of constructing the path manually (which doesn't work for Seasons/TitleCards),
    // we ask the backend to find the actual asset file in the filesystem
    try {
      const response = await fetch(`/api/imagechoices/${asset.id}/find-asset`);

      if (!response.ok) {
        console.error("Failed to find asset file:", await response.text());
        // Fallback to manual construction for backwards compatibility
        constructAssetManually(asset);
        return;
      }

      const data = await response.json();

      if (data.success && data.asset) {
        // Use the actual asset path from filesystem
        const assetTypeRaw = (asset.Type || "").toLowerCase();
        let mediaType = "movie";
        if (
          assetTypeRaw.includes("show") ||
          assetTypeRaw.includes("series") ||
          assetTypeRaw.includes("episode") ||
          assetTypeRaw.includes("season") ||
          assetTypeRaw.includes("titlecard") ||
          assetTypeRaw.includes("tv")
        ) {
          mediaType = "tv";
        }

        const assetForReplacer = {
          id: asset.id,
          title: asset.Title,
          name: data.asset.name,
          path: data.asset.path,
          type: mediaType,
          library: data.asset.library,
          url: data.asset.url,
          _dbData: asset,
          _originalType: asset.Type,
        };

        console.log("🔄 Found actual asset file from filesystem:", {
          dbRecord: {
            Title: asset.Title,
            Type: asset.Type,
            Rootfolder: asset.Rootfolder,
          },
          foundAsset: {
            path: data.asset.path,
            name: data.asset.name,
            type: mediaType,
          },
        });

        setSelectedAsset(assetForReplacer);
        setShowReplacer(true);
      } else {
        console.error("Backend found no asset file");
        constructAssetManually(asset);
      }
    } catch (error) {
      console.error("Error finding asset:", error);
      constructAssetManually(asset);
    }
  };

  // Fallback: Manual path construction (for backwards compatibility)
  const constructAssetManually = (asset) => {
    console.warn("⚠️ Using manual path construction as fallback");

    let fullPath;

    if (asset.Rootfolder) {
      // Rootfolder contains: "Man-Thing (2005) {tmdb-18882}"
      // Determine filename based on asset type (same as actual file structure)
      const assetType = (asset.Type || "").toLowerCase();
      let filename = "poster.jpg"; // Default

      if (assetType.includes("background")) {
        filename = "background.jpg";
      } else if (assetType.includes("season")) {
        filename = "season.jpg";
      } else if (assetType.includes("titlecard")) {
        filename = "titlecard.jpg";
      }

      // Construct path like Gallery does: "LibraryName/Rootfolder/filename"
      fullPath = `${asset.LibraryName}/${asset.Rootfolder}/${filename}`;
    } else if (asset.Title) {
      // Fallback without Rootfolder
      const assetType = (asset.Type || "").toLowerCase();
      const filename = assetType.includes("background")
        ? "background.jpg"
        : "poster.jpg";
      fullPath = `${asset.LibraryName || "4K"}/${asset.Title}/${filename}`;
    } else {
      // Last fallback
      fullPath = `${asset.LibraryName || "4K"}/unknown.jpg`;
    }

    // Determine the correct type for AssetReplacer
    // AssetReplacer's extractMetadata expects:
    // - asset.type to determine media_type ("movie" vs "tv")
    // - asset.type or path to determine asset_type ("poster", "background", etc.)
    const assetTypeRaw = (asset.Type || "").toLowerCase();

    // Determine if it's a movie or TV show
    // DB Type examples:
    // - Movies: "Movie", "Movie Background"
    // - TV: "Show", "Show Background", "Season", "Season Poster", "TitleCard", "Episode"
    let mediaType = "movie"; // Default
    if (
      assetTypeRaw.includes("show") ||
      assetTypeRaw.includes("series") ||
      assetTypeRaw.includes("episode") ||
      assetTypeRaw.includes("season") ||
      assetTypeRaw.includes("titlecard") ||
      assetTypeRaw.includes("tv")
    ) {
      mediaType = "tv";
    }

    const assetForReplacer = {
      id: asset.id,
      title: asset.Title,
      name: fullPath.split("/").pop(), // Just the filename
      path: fullPath, // Relative path from assets folder (like Gallery)
      type: mediaType, // "movie" or "tv" - used by extractMetadata() to set media_type
      library: asset.LibraryName || "",
      url: `/poster_assets/${fullPath}`, // Same URL format as Gallery
      // Pass through original DB data for debugging
      _dbData: asset,
      _originalType: asset.Type, // Keep original for reference
    };

    console.log(
      "🔄 Converting asset for replacer (Gallery-compatible format):",
      {
        original: {
          Title: asset.Title,
          Type: asset.Type,
          Rootfolder: asset.Rootfolder,
          LibraryName: asset.LibraryName,
        },
        converted: {
          path: assetForReplacer.path,
          name: assetForReplacer.name,
          url: assetForReplacer.url,
          type: assetForReplacer.type,
        },
      }
    );

    setSelectedAsset(assetForReplacer);
    setShowReplacer(true);
  };

  // Handle successful replacement
  const handleReplaceSuccess = async () => {
    // Delete the DB entry after successful replacement
    try {
      const response = await fetch(`/api/imagechoices/${selectedAsset.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        console.log("✅ DB entry deleted after successful replacement");
        // Refresh the data to update the UI
        await fetchData();

        // Trigger event to update sidebar badge count
        window.dispatchEvent(new Event("assetReplaced"));
      } else {
        console.error("❌ Failed to delete DB entry");
      }
    } catch (error) {
      console.error("Error deleting DB entry:", error);
    }

    setShowReplacer(false);
    setSelectedAsset(null);
  };

  // Handle closing the replacer
  const handleCloseReplacer = () => {
    setShowReplacer(false);
    setSelectedAsset(null);
  };

  // Get all assets from all categories
  const allAssets = useMemo(() => {
    if (!data) return [];
    const assets = new Map();

    // Collect all unique assets
    Object.values(data.categories).forEach((category) => {
      category.assets.forEach((asset) => {
        if (!assets.has(asset.id)) {
          assets.set(asset.id, asset);
        }
      });
    });

    return Array.from(assets.values());
  }, [data]);

  // Get unique types and libraries for filters (excluding Manual entries)
  const types = useMemo(() => {
    const nonManualAssets = allAssets.filter(
      (asset) =>
        !asset.Manual ||
        (asset.Manual.toLowerCase() !== "true" && asset.Manual !== true)
    );
    const uniqueTypes = new Set(
      nonManualAssets.map((a) => a.Type).filter(Boolean)
    );
    return ["All Types", ...Array.from(uniqueTypes).sort()];
  }, [allAssets]);

  const libraries = useMemo(() => {
    const nonManualAssets = allAssets.filter(
      (asset) =>
        !asset.Manual ||
        (asset.Manual.toLowerCase() !== "true" && asset.Manual !== true)
    );
    const uniqueLibs = new Set(
      nonManualAssets.map((a) => a.LibraryName).filter(Boolean)
    );
    return ["All Libraries", ...Array.from(uniqueLibs).sort()];
  }, [allAssets]);

  // Filter assets based on selected category and filters
  const filteredAssets = useMemo(() => {
    if (!data) return [];

    let assets = [];

    // Select assets based on category
    if (selectedCategory === "All Categories") {
      assets = allAssets;
    } else {
      const categoryKey = selectedCategory.toLowerCase().replace(/[- ]/g, "_");
      assets = data.categories[categoryKey]?.assets || [];
    }

    // Filter out Manual entries (Manual === "true" or true)
    assets = assets.filter(
      (asset) =>
        !asset.Manual ||
        (asset.Manual.toLowerCase() !== "true" && asset.Manual !== true)
    );

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      assets = assets.filter(
        (asset) =>
          asset.Title?.toLowerCase().includes(query) ||
          asset.Rootfolder?.toLowerCase().includes(query)
      );
    }

    // Apply type filter
    if (selectedType !== "All Types") {
      assets = assets.filter((asset) => asset.Type === selectedType);
    }

    // Apply library filter
    if (selectedLibrary !== "All Libraries") {
      assets = assets.filter((asset) => asset.LibraryName === selectedLibrary);
    }

    return assets;
  }, [
    data,
    selectedCategory,
    searchQuery,
    selectedType,
    selectedLibrary,
    allAssets,
  ]);

  // Get tags for an asset
  const getAssetTags = (asset) => {
    const tags = [];

    // 1. MISSING ASSET CHECK
    // Missing if: DownloadSource is false/empty OR FavProviderLink is false/empty
    const downloadSource = asset.DownloadSource;
    const providerLink = asset.FavProviderLink;

    const isDownloadMissing =
      downloadSource === "false" || downloadSource === false || !downloadSource;

    const isProviderLinkMissing =
      providerLink === "false" || providerLink === false || !providerLink;

    if (isDownloadMissing || isProviderLinkMissing) {
      tags.push({
        label: t("assetOverview.missingAsset"),
        color: "bg-red-500/20 text-red-400 border-red-500/30",
      });
    }

    // 2. NON-PRIMARY PROVIDER CHECK
    // Check if DownloadSource OR FavProviderLink don't match the primary provider
    // Only check if we have both DownloadSource AND FavProviderLink
    if (!isDownloadMissing && !isProviderLinkMissing) {
      const primaryProvider = data?.config?.primary_provider || "";

      if (primaryProvider) {
        const providerPatterns = {
          tmdb: ["tmdb", "themoviedb"],
          tvdb: ["tvdb", "thetvdb"],
          fanart: ["fanart"],
          plex: ["plex"],
        };

        const patterns = providerPatterns[primaryProvider] || [primaryProvider];

        // Check if DownloadSource contains the primary provider
        const isDownloadFromPrimaryProvider = patterns.some((pattern) =>
          downloadSource.toLowerCase().includes(pattern)
        );

        // Check if FavProviderLink contains the primary provider
        const isFavLinkFromPrimaryProvider = patterns.some((pattern) =>
          providerLink.toLowerCase().includes(pattern)
        );

        // Show badge if EITHER DownloadSource OR FavProviderLink is not from primary provider
        if (!isDownloadFromPrimaryProvider || !isFavLinkFromPrimaryProvider) {
          tags.push({
            label: t("assetOverview.notPrimaryProvider"),
            color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
          });
        }
      }
    }

    // 3. NON-PRIMARY LANGUAGE CHECK
    // Language is either a valid language code/string or "false" (string)
    if (
      asset.Language &&
      asset.Language !== "false" &&
      asset.Language !== false &&
      data?.config?.primary_language
    ) {
      const langNormalized =
        asset.Language.toLowerCase() === "textless"
          ? "xx"
          : asset.Language.toLowerCase();
      const primaryNormalized =
        data.config.primary_language.toLowerCase() === "textless"
          ? "xx"
          : data.config.primary_language.toLowerCase();

      if (langNormalized !== primaryNormalized) {
        tags.push({
          label: t("assetOverview.notPrimaryLanguage"),
          color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
        });
      }
    } else if (
      asset.Language &&
      asset.Language !== "false" &&
      asset.Language !== false &&
      !data?.config?.primary_language
    ) {
      // No primary language set, anything that's not Textless/xx is non-primary
      if (!["textless", "xx"].includes(asset.Language.toLowerCase())) {
        tags.push({
          label: t("assetOverview.notPrimaryLanguage"),
          color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
        });
      }
    }

    // 4. TRUNCATED TEXT CHECK
    if (
      asset.TextTruncated &&
      (asset.TextTruncated.toLowerCase() === "true" ||
        asset.TextTruncated === true)
    ) {
      tags.push({
        label: t("assetOverview.truncatedText"),
        color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      });
    }

    return tags;
  };

  // Category cards configuration
  const categoryCards = useMemo(() => {
    if (!data) return [];

    return [
      {
        key: "assets_with_issues",
        label: t("assetOverview.assetsWithIssues"),
        count: data.categories.assets_with_issues.count,
        icon: AlertTriangle,
        color: "text-yellow-400",
        bgColor: "bg-gradient-to-br from-black/80 to-black/60",
        borderColor: "border-black/40",
        hoverBorderColor: "hover:border-yellow-500/50",
      },
      {
        key: "missing_assets",
        label: t("assetOverview.missingAssets"),
        count: data.categories.missing_assets.count,
        icon: FileQuestion,
        color: "text-red-400",
        bgColor: "bg-gradient-to-br from-red-900/30 to-red-950/20",
        borderColor: "border-red-900/40",
        hoverBorderColor: "hover:border-red-500/50",
      },
      {
        key: "non_primary_lang",
        label: t("assetOverview.nonPrimaryLang"),
        count: data.categories.non_primary_lang.count,
        icon: Globe,
        color: "text-yellow-400",
        bgColor: "bg-gradient-to-br from-yellow-900/20 to-yellow-950/10",
        borderColor: "border-yellow-900/40",
        hoverBorderColor: "hover:border-yellow-500/50",
      },
      {
        key: "non_primary_provider",
        label: t("assetOverview.nonPrimaryProvider"),
        count: data.categories.non_primary_provider.count,
        icon: Database,
        color: "text-orange-400",
        bgColor: "bg-gradient-to-br from-orange-900/30 to-orange-950/20",
        borderColor: "border-orange-900/40",
        hoverBorderColor: "hover:border-orange-500/50",
      },
      {
        key: "truncated_text",
        label: t("assetOverview.truncatedTextCategory"),
        count: data.categories.truncated_text.count,
        icon: Type,
        color: "text-purple-400",
        bgColor: "bg-gradient-to-br from-purple-900/30 to-purple-950/20",
        borderColor: "border-purple-900/40",
        hoverBorderColor: "hover:border-purple-500/50",
      },
    ];
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin text-theme-primary mx-auto mb-4" />
          <p className="text-theme-muted">{t("assetOverview.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <div>
            <h3 className="text-lg font-semibold text-red-400">
              {t("assetOverview.errorLoadingData")}
            </h3>
            <p className="text-red-300/80">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-orange-400" />
            <h1 className="text-3xl font-bold text-theme-text">
              {t("assetOverview.title")}
            </h1>
          </div>
          <p className="text-theme-muted mt-2">
            {t("assetOverview.description")}
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm"
        >
          <RefreshCw className="w-4 h-4 text-theme-primary" />
          <span className="text-theme-text">{t("common.refresh")}</span>
        </button>
      </div>

      {/* Category Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {categoryCards.map((card) => {
          const Icon = card.icon;
          const isSelected = selectedCategory === card.label;

          return (
            <button
              key={card.key}
              onClick={() =>
                setSelectedCategory(isSelected ? "All Categories" : card.label)
              }
              className={`relative p-5 rounded-xl border-2 transition-all duration-200 bg-black/60 ${
                card.borderColor
              } ${card.hoverBorderColor} ${
                isSelected
                  ? "ring-2 ring-theme-primary/50 scale-105 shadow-lg"
                  : "hover:scale-102 shadow-md"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <Icon className={`w-6 h-6 ${card.color}`} />
                <span className={`text-3xl font-bold ${card.color}`}>
                  {card.count}
                </span>
              </div>
              <div className="text-sm font-semibold text-gray-300 text-left">
                {card.label}
              </div>
              {isSelected && (
                <div className="absolute inset-0 bg-theme-primary/5 rounded-xl pointer-events-none" />
              )}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-theme-card border border-theme rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
            <input
              type="text"
              placeholder={t("assetOverview.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
            />
          </div>

          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text focus:outline-none focus:ring-2 focus:ring-theme-primary"
          >
            {types.map((type) => (
              <option key={type} value={type}>
                {type === "All Types" ? t("assetOverview.allTypes") : type}
              </option>
            ))}
          </select>

          {/* Library Filter */}
          <select
            value={selectedLibrary}
            onChange={(e) => setSelectedLibrary(e.target.value)}
            className="px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text focus:outline-none focus:ring-2 focus:ring-theme-primary"
          >
            {libraries.map((lib) => (
              <option key={lib} value={lib}>
                {lib === "All Libraries"
                  ? t("assetOverview.allLibraries")
                  : lib}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text focus:outline-none focus:ring-2 focus:ring-theme-primary"
          >
            <option value="All Categories">
              {t("assetOverview.allCategories")}
            </option>
            {categoryCards.map((card) => (
              <option key={card.key} value={card.label}>
                {card.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Assets Grid */}
      <div className="bg-theme-card border border-theme rounded-lg p-6">
        <h2 className="text-xl font-bold text-theme-text mb-4">
          {selectedCategory === "All Categories"
            ? t("assetOverview.allAssets")
            : selectedCategory}
          <span className="text-theme-muted ml-2">
            ({filteredAssets.length})
          </span>
        </h2>

        {filteredAssets.length === 0 ? (
          <div className="text-center py-12">
            <FileQuestion className="w-16 h-16 text-theme-muted mx-auto mb-4" />
            <p className="text-theme-muted">
              {t("assetOverview.noAssetsFound")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAssets.map((asset) => {
              const tags = getAssetTags(asset);

              return (
                <div
                  key={asset.id}
                  className="bg-theme-bg border border-theme rounded-lg p-4 hover:border-theme-primary/50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-theme-text break-words">
                        {asset.Title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-sm text-theme-muted">
                        <span className="font-medium">
                          {t("assetOverview.type")}:
                        </span>
                        <span className="bg-theme-card px-2 py-0.5 rounded">
                          {asset.Type || "Unknown"}
                        </span>
                        <span className="hidden sm:inline">•</span>
                        <span className="font-medium">
                          {t("assetOverview.language")}:
                        </span>
                        <span className="bg-theme-card px-2 py-0.5 rounded">
                          {asset.Language &&
                          asset.Language !== "false" &&
                          asset.Language !== false
                            ? asset.Language
                            : "Unknown"}
                        </span>
                        <span className="hidden sm:inline">•</span>
                        <span className="font-medium">
                          {t("assetOverview.source")}:
                        </span>
                        {asset.FavProviderLink &&
                        asset.FavProviderLink !== "false" &&
                        asset.FavProviderLink !== false ? (
                          <a
                            href={asset.FavProviderLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-theme-card px-2 py-0.5 rounded text-theme-primary hover:text-theme-primary/80 hover:underline transition-colors break-all"
                            title={asset.DownloadSource || "View Source"}
                          >
                            {asset.DownloadSource &&
                            asset.DownloadSource !== "false" &&
                            asset.DownloadSource !== false
                              ? asset.DownloadSource.length > 50
                                ? `${asset.DownloadSource.substring(0, 50)}...`
                                : asset.DownloadSource
                              : "View Source"}
                          </a>
                        ) : (
                          <span className="bg-theme-card px-2 py-0.5 rounded break-all">
                            {asset.DownloadSource &&
                            asset.DownloadSource !== "false" &&
                            asset.DownloadSource !== false
                              ? asset.DownloadSource.length > 50
                                ? `${asset.DownloadSource.substring(0, 50)}...`
                                : asset.DownloadSource
                              : "Missing"}
                          </span>
                        )}
                      </div>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {tags.map((tag, index) => (
                          <span
                            key={index}
                            className={`px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${tag.color}`}
                          >
                            {tag.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Replace Button */}
                    <div className="flex items-start">
                      <button
                        onClick={() => handleReplace(asset)}
                        className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-theme-text transition-all whitespace-nowrap shadow-sm"
                        title={t("assetOverview.replaceTooltip")}
                      >
                        <Replace className="w-4 h-4 text-theme-primary" />
                        {t("assetOverview.replace")}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Asset Replacer Modal */}
      {showReplacer && selectedAsset && (
        <AssetReplacer
          asset={selectedAsset}
          onClose={handleCloseReplacer}
          onSuccess={handleReplaceSuccess}
        />
      )}
    </div>
  );
};

export default AssetOverview;
