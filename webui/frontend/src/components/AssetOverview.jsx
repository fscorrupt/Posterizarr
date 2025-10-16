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
} from "lucide-react";

const AssetOverview = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("All Types");
  const [selectedLibrary, setSelectedLibrary] = useState("All Libraries");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");

  // Fetch data from API
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/assets/overview");
      if (!response.ok) throw new Error("Failed to fetch asset overview");
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

  // Get unique types and libraries for filters
  const types = useMemo(() => {
    const uniqueTypes = new Set(allAssets.map((a) => a.Type).filter(Boolean));
    return ["All Types", ...Array.from(uniqueTypes).sort()];
  }, [allAssets]);

  const libraries = useMemo(() => {
    const uniqueLibs = new Set(
      allAssets.map((a) => a.LibraryName).filter(Boolean)
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

    if (asset.DownloadSource === "N/A") {
      tags.push({
        label: "Missing Asset",
        color: "bg-red-500/20 text-red-400 border-red-500/30",
      });
    }

    // Check if there's a language issue
    let isLanguageIssue = false;
    if (asset.Language && data?.config?.primary_language) {
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
          label: "Not Primary Language",
          color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
        });
        isLanguageIssue = true;
      }
    } else if (asset.Language && !data?.config?.primary_language) {
      // No primary language set, anything that's not Textless/xx is non-primary
      if (!["textless", "xx"].includes(asset.Language.toLowerCase())) {
        tags.push({
          label: "Not Primary Language",
          color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
        });
        isLanguageIssue = true;
      }
    }

    // Provider check: Only if Fallback=true AND it's NOT a language issue
    if (
      asset.Fallback &&
      asset.Fallback.toLowerCase() === "true" &&
      !isLanguageIssue
    ) {
      // Check if provider is not primary
      const providerLink = asset.FavProviderLink || "";
      const primaryProvider = data?.config?.primary_provider || "";

      if (primaryProvider && providerLink && providerLink !== "N/A") {
        const providerPatterns = {
          tmdb: ["tmdb", "themoviedb"],
          tvdb: ["tvdb", "thetvdb"],
          fanart: ["fanart"],
          plex: ["plex"],
        };

        const patterns = providerPatterns[primaryProvider] || [primaryProvider];
        const isPrimaryProvider = patterns.some((pattern) =>
          providerLink.toLowerCase().includes(pattern)
        );

        if (!isPrimaryProvider) {
          tags.push({
            label: "Not Primary Provider",
            color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
          });
        }
      }
    }

    if (asset.TextTruncated && asset.TextTruncated.toLowerCase() === "true") {
      tags.push({
        label: "Truncated Text",
        color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      });
    }
    if (asset.Manual && asset.Manual.toLowerCase() === "true") {
      tags.push({
        label: "Manual",
        color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
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
        label: "Assets with Issues",
        count: data.categories.assets_with_issues.count,
        icon: AlertTriangle,
        color: "text-yellow-400",
        bgColor: "bg-yellow-500/10",
        borderColor: "border-yellow-500/20",
      },
      {
        key: "missing_assets",
        label: "Missing Assets",
        count: data.categories.missing_assets.count,
        icon: FileQuestion,
        color: "text-red-400",
        bgColor: "bg-red-500/10",
        borderColor: "border-red-500/20",
      },
      {
        key: "non_primary_lang",
        label: "Non-Primary Lang",
        count: data.categories.non_primary_lang.count,
        icon: Globe,
        color: "text-yellow-400",
        bgColor: "bg-yellow-500/10",
        borderColor: "border-yellow-500/20",
      },
      {
        key: "non_primary_provider",
        label: "Non-Primary Provider",
        count: data.categories.non_primary_provider.count,
        icon: Database,
        color: "text-orange-400",
        bgColor: "bg-orange-500/10",
        borderColor: "border-orange-500/20",
      },
      {
        key: "truncated_text",
        label: "Truncated Text",
        count: data.categories.truncated_text.count,
        icon: Type,
        color: "text-purple-400",
        bgColor: "bg-purple-500/10",
        borderColor: "border-purple-500/20",
      },
      {
        key: "manual",
        label: "Manual",
        count: data.categories.manual.count,
        icon: Edit,
        color: "text-blue-400",
        bgColor: "bg-blue-500/10",
        borderColor: "border-blue-500/20",
      },
    ];
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin text-theme-primary mx-auto mb-4" />
          <p className="text-theme-muted">Loading asset overview...</p>
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
              Error Loading Data
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
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-yellow-400" />
            <h1 className="text-3xl font-bold text-theme-text">
              Missing Assets
            </h1>
          </div>
          <p className="text-theme-muted mt-2">
            Overview of all assets with detailed categorization
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-theme-primary hover:bg-theme-primary/80 text-white rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Category Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {categoryCards.map((card) => {
          const Icon = card.icon;
          const isSelected = selectedCategory === card.label;

          return (
            <button
              key={card.key}
              onClick={() =>
                setSelectedCategory(isSelected ? "All Categories" : card.label)
              }
              className={`p-4 rounded-lg border transition-all ${
                isSelected
                  ? `${card.bgColor} ${card.borderColor} scale-105`
                  : "bg-theme-card border-theme hover:border-theme-primary/30"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-5 h-5 ${card.color}`} />
                <span className={`text-2xl font-bold ${card.color}`}>
                  {card.count}
                </span>
              </div>
              <div className="text-sm font-medium text-theme-muted text-left">
                {card.label}
              </div>
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
              placeholder="Search by title or path..."
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
                {type}
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
                {lib}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text focus:outline-none focus:ring-2 focus:ring-theme-primary"
          >
            <option value="All Categories">All Categories</option>
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
            ? "All Assets"
            : selectedCategory}
          <span className="text-theme-muted ml-2">
            ({filteredAssets.length})
          </span>
        </h2>

        {filteredAssets.length === 0 ? (
          <div className="text-center py-12">
            <FileQuestion className="w-16 h-16 text-theme-muted mx-auto mb-4" />
            <p className="text-theme-muted">No assets found</p>
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
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-theme-text truncate">
                        {asset.Title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-sm text-theme-muted">
                        <span className="font-medium">Type:</span>
                        <span className="bg-theme-card px-2 py-0.5 rounded">
                          {asset.Type || "N/A"}
                        </span>
                        <span className="mx-2">•</span>
                        <span className="font-medium">Language:</span>
                        <span className="bg-theme-card px-2 py-0.5 rounded">
                          {asset.Language || "N/A"}
                        </span>
                        <span className="mx-2">•</span>
                        <span className="font-medium">Source:</span>
                        <span className="bg-theme-card px-2 py-0.5 rounded">
                          {asset.DownloadSource || "N/A"}
                        </span>
                      </div>
                      {asset.FavProviderLink &&
                        asset.FavProviderLink !== "N/A" && (
                          <div className="mt-2">
                            <a
                              href={asset.FavProviderLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-theme-primary hover:underline"
                            >
                              View Source
                            </a>
                          </div>
                        )}
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-2 max-w-md">
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetOverview;
