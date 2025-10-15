import React, { useState, useEffect } from "react";
import {
  AlertCircle,
  Search,
  RefreshCw,
  Film,
  Tv,
  Image as ImageIcon,
  Layers,
  Filter,
  Download,
  Globe,
  Server,
  Type,
  FileX,
  Edit,
  Check,
  Trash2,
  Replace,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import AssetReplacer from "./AssetReplacer";

const MissingAssets = () => {
  const { showSuccess, showError } = useToast();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all"); // "all", "poster", "background", "season", "titlecard"
  const [filterLibrary, setFilterLibrary] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all"); // "all", "missing", "non-primary-language", "non-primary-provider", "truncated", "manual"
  const [libraries, setLibraries] = useState([]);
  const [replacerOpen, setReplacerOpen] = useState(false);
  const [assetToReplace, setAssetToReplace] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [languageConfig, setLanguageConfig] = useState({
    preferredLanguageOrder: [],
    preferredSeasonLanguageOrder: [],
    preferredBackgroundLanguageOrder: [],
  });
  const [favProvider, setFavProvider] = useState("");

  // Load assets on mount
  useEffect(() => {
    loadAssets();
    loadLanguageConfig();
  }, []);

  const loadLanguageConfig = async () => {
    try {
      const response = await fetch("/api/config");
      const data = await response.json();

      if (data.success && data.config) {
        const config = data.config;

        // Parse language orders (they might be comma-separated strings or arrays)
        const parseLanguageOrder = (value) => {
          if (!value) return [];
          if (Array.isArray(value))
            return value.map((l) => l.toLowerCase().trim());
          if (typeof value === "string") {
            return value
              .split(",")
              .map((l) => l.toLowerCase().trim())
              .filter(Boolean);
          }
          return [];
        };

        setLanguageConfig({
          preferredLanguageOrder: parseLanguageOrder(
            config.PreferredLanguageOrder || config.languagepriority
          ),
          preferredSeasonLanguageOrder: parseLanguageOrder(
            config.PreferredSeasonLanguageOrder || config.seasonlanguagepriority
          ),
          preferredBackgroundLanguageOrder: parseLanguageOrder(
            config.PreferredBackgroundLanguageOrder ||
              config.backgroundlanguagepriority
          ),
        });

        // Get FavProvider (e.g., "tmdb", "fanart", "tvdb")
        setFavProvider(
          (config.FavProvider || config.favprovider || "").toLowerCase().trim()
        );
      }
    } catch (err) {
      console.error("Error loading language config:", err);
    }
  };

  const loadAssets = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/missing-assets");
      const data = await response.json();

      if (data.success) {
        setAssets(data.assets || []);
        // Extract unique libraries (filter out empty/unknown)
        const uniqueLibraries = [
          ...new Set(
            data.assets
              ?.filter(
                (item) =>
                  item.library_name &&
                  item.library_name.toUpperCase() !== "UNKNOWN"
              )
              .map((item) => item.library_name) || []
          ),
        ];
        setLibraries(uniqueLibraries);
      } else {
        showError("Failed to load assets");
      }
    } catch (err) {
      console.error("Error loading assets:", err);
      showError("Failed to load assets: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAssets();
    setRefreshing(false);
    showSuccess("Assets refreshed");
  };

  // Transform asset for AssetReplacer
  const transformAssetForReplacer = (asset) => {
    // Map database types to AssetReplacer expected types
    const typeMapping = {
      movie: "poster",
      season: "season",
      "movie background": "background",
      "season background": "background",
      "tv background": "background",
      "series background": "background",
      "episode background": "background",
      episode: "titlecard",
    };

    // Map database types to filenames
    const filenameMapping = {
      movie: "poster.jpg",
      season: "Season01.jpg", // Will be updated if we can detect season number
      "movie background": "background.jpg",
      "season background": "background.jpg",
      "tv background": "background.jpg",
      "series background": "background.jpg",
      "episode background": "background.jpg",
      episode: "S01E01.jpg", // Will be updated if we can detect episode number
    };

    // Determine media type based on asset type
    // Movie types: "movie", "movie background"
    // TV types: "season", "season background", "episode", "episode background", "tv background", "series background"
    const movieTypes = ["movie", "movie background"];
    const isMovie = movieTypes.includes(asset.type.toLowerCase());

    // Get the appropriate filename for this asset type
    const filename = filenameMapping[asset.type.toLowerCase()] || "poster.jpg";

    // Build full path: "LibraryName/Rootfolder/filename.jpg"
    const fullPath = asset.library_name
      ? `${asset.library_name}/${asset.rootfolder}/${filename}`
      : `${asset.rootfolder}/${filename}`;

    return {
      path: fullPath,
      type: typeMapping[asset.type] || asset.type,
      url: asset.fav_provider_link || "", // Use the provider link if available
      name: asset.title,
      library_name: asset.library_name,
      folder_name: asset.rootfolder, // Pass the rootfolder (folder name without library path)
      // Pass media_type hint (AssetReplacer will still auto-detect from path)
      media_type: isMovie ? "movie" : "tv",
    };
  };

  const handleMarkAsChanged = async (asset) => {
    try {
      const response = await fetch("/api/missing-assets/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: asset.title,
          type: asset.type,
          rootfolder: asset.rootfolder,
        }),
      });

      const data = await response.json();

      if (data.success) {
        showSuccess(`"${asset.title}" removed from database`);
        // Reload assets to update the list
        await loadAssets();
      } else {
        showError("Failed to remove asset from database");
      }
    } catch (err) {
      console.error("Error removing asset:", err);
      showError("Failed to remove asset: " + err.message);
    }
  };

  // Categorize asset based on its properties
  const categorizeAsset = (asset) => {
    const categories = [];

    // 1. MISSING ASSETS: Download Source is "N/A" or empty
    if (
      !asset.download_source ||
      asset.download_source === "N/A" ||
      asset.download_source === ""
    ) {
      categories.push("missing");
    }

    // 2. NON-PRIMARY LANGUAGE: Language is not the first in the appropriate language order
    if (asset.language) {
      let assetLang = asset.language.toLowerCase().trim();

      // Map TEXTLESS to xx (textless is stored as "TEXTLESS" or "Textless" in DB, but config uses "xx")
      if (assetLang === "textless") {
        assetLang = "xx";
      }

      let primaryLang = null;

      // Determine which language order to use based on asset type
      const assetType = asset.type?.toLowerCase() || "";

      if (assetType.includes("season") && !assetType.includes("background")) {
        // Season posters use PreferredSeasonLanguageOrder
        primaryLang = languageConfig.preferredSeasonLanguageOrder[0];
      } else if (
        assetType.includes("background") ||
        assetType.includes("episode")
      ) {
        // Backgrounds and title cards use PreferredBackgroundLanguageOrder
        primaryLang = languageConfig.preferredBackgroundLanguageOrder[0];
      } else {
        // Standard posters use PreferredLanguageOrder
        primaryLang = languageConfig.preferredLanguageOrder[0];
      }

      // Check if asset language is NOT the primary language
      if (primaryLang && assetLang !== primaryLang) {
        categories.push("non-primary-language");
      }
    }

    // 3. NON-PRIMARY PROVIDER: Check if fav_provider_link matches FavProvider from config
    if (favProvider && asset.fav_provider_link) {
      const providerLink = asset.fav_provider_link.toLowerCase();

      // Check if the provider link contains the favorite provider
      // FavProvider examples: "tmdb", "fanart", "tvdb"
      // Links examples: "https://www.themoviedb.org/...", "https://assets.fanart.tv/...", "https://thetvdb.com/..."
      const providerMap = {
        tmdb: "themoviedb.org",
        fanart: "fanart.tv",
        tvdb: "thetvdb.com",
      };

      const expectedProvider = providerMap[favProvider] || favProvider;

      // If the link doesn't contain the expected provider, it's using a fallback
      if (!providerLink.includes(expectedProvider)) {
        categories.push("non-primary-provider");
      }
    } else if (
      // Fallback to checking the fallback field if no fav_provider_link or favProvider config
      asset.fallback === "true" ||
      asset.fallback === true ||
      asset.fallback === "True"
    ) {
      categories.push("non-primary-provider");
    }

    // 4. TRUNCATED TEXT: TextTruncated is "true"
    if (
      asset.text_truncated === "true" ||
      asset.text_truncated === true ||
      asset.text_truncated === "True"
    ) {
      categories.push("truncated");
    }

    // 5. MANUALLY CREATED: is_manually_created is "true"
    if (
      asset.is_manually_created === "true" ||
      asset.is_manually_created === true ||
      asset.is_manually_created === "True"
    ) {
      categories.push("manual");
    }

    return categories;
  };

  // Map filter type to actual database types
  const getTypesForFilter = (filterType) => {
    switch (filterType.toLowerCase()) {
      case "poster":
        return ["movie", "season"];
      case "background":
        return [
          "movie background",
          "season background",
          "tv background",
          "series background",
          "episode background",
        ];
      case "titlecard":
        return ["episode"];
      case "season":
        return ["season"];
      default:
        return null; // "all" - no filtering
    }
  };

  // Filter assets based on search and filters
  const filteredAssets = assets.filter((asset) => {
    // Filter out invalid/empty entries (UNKNOWN, no title, no type)
    if (
      !asset.title ||
      asset.title.toUpperCase() === "UNKNOWN" ||
      !asset.type
    ) {
      return false;
    }

    // Filter out unknown libraries
    if (!asset.library_name || asset.library_name.toUpperCase() === "UNKNOWN") {
      return false;
    }

    const categories = categorizeAsset(asset);

    // Only show assets that have at least one category (issue)
    if (categories.length === 0) return false;

    const matchesSearch =
      asset.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.rootfolder?.toLowerCase().includes(searchTerm.toLowerCase());

    // Type matching with mapping
    const allowedTypes = getTypesForFilter(filterType);
    const matchesType =
      filterType === "all" ||
      (allowedTypes &&
        allowedTypes.some(
          (type) => asset.type?.toLowerCase() === type.toLowerCase()
        ));

    const matchesLibrary =
      filterLibrary === "all" || asset.library_name === filterLibrary;

    const matchesCategory =
      filterCategory === "all" || categories.includes(filterCategory);

    return matchesSearch && matchesType && matchesLibrary && matchesCategory;
  });

  const getTypeIcon = (type) => {
    switch (type?.toLowerCase()) {
      case "poster":
        return <ImageIcon className="w-5 h-5" />;
      case "background":
        return <Layers className="w-5 h-5" />;
      case "season":
        return <Film className="w-5 h-5" />;
      case "titlecard":
        return <Tv className="w-5 h-5" />;
      default:
        return <AlertCircle className="w-5 h-5" />;
    }
  };

  const getTypeColor = (type) => {
    switch (type?.toLowerCase()) {
      case "poster":
        return "text-blue-500";
      case "background":
        return "text-purple-500";
      case "season":
        return "text-green-500";
      case "titlecard":
        return "text-orange-500";
      default:
        return "text-gray-500";
    }
  };

  const getCategoryBadge = (category, assetType = null) => {
    switch (category) {
      case "missing":
        return {
          label: assetType ? `Missing ${assetType}` : "Missing Asset",
          icon: <FileX className="w-3.5 h-3.5" />,
          className:
            "bg-red-500/15 text-red-300 border border-red-400/50 shadow-sm",
        };
      case "non-primary-language":
        return {
          label: "Not Primary Language",
          icon: <Globe className="w-3.5 h-3.5" />,
          className:
            "bg-yellow-500/15 text-yellow-300 border border-yellow-400/50 shadow-sm",
        };
      case "non-primary-provider":
        return {
          label: "Not Primary Provider",
          icon: <Server className="w-3.5 h-3.5" />,
          className:
            "bg-orange-500/15 text-orange-300 border border-orange-400/50 shadow-sm",
        };
      case "truncated":
        return {
          label: "Truncated Text",
          icon: <Type className="w-3.5 h-3.5" />,
          className:
            "bg-purple-500/15 text-purple-300 border border-purple-400/50 shadow-sm",
        };
      case "manual":
        return {
          label: "Manually Created",
          icon: <Edit className="w-3.5 h-3.5" />,
          className:
            "bg-blue-500/15 text-blue-300 border border-blue-400/50 shadow-sm",
        };
      default:
        return null;
    }
  };

  // Calculate stats (only count assets with issues and valid data)
  const assetsWithIssues = assets.filter((a) => {
    // Filter out invalid/empty entries
    if (!a.title || a.title.toUpperCase() === "UNKNOWN" || !a.type) {
      return false;
    }
    // Filter out unknown libraries
    if (!a.library_name || a.library_name.toUpperCase() === "UNKNOWN") {
      return false;
    }
    return categorizeAsset(a).length > 0;
  });

  const stats = {
    total: assetsWithIssues.length,
    missing: assetsWithIssues.filter((a) => {
      const cats = categorizeAsset(a);
      return cats.includes("missing");
    }).length,
    nonPrimaryLanguage: assetsWithIssues.filter((a) => {
      const cats = categorizeAsset(a);
      return cats.includes("non-primary-language");
    }).length,
    nonPrimaryProvider: assetsWithIssues.filter((a) => {
      const cats = categorizeAsset(a);
      return cats.includes("non-primary-provider");
    }).length,
    truncated: assetsWithIssues.filter((a) => {
      const cats = categorizeAsset(a);
      return cats.includes("truncated");
    }).length,
    manual: assetsWithIssues.filter((a) => {
      const cats = categorizeAsset(a);
      return cats.includes("manual");
    }).length,
  };

  const groupedByLibrary = filteredAssets.reduce((acc, asset) => {
    const lib = asset.library_name || "Unknown";
    if (!acc[lib]) {
      acc[lib] = [];
    }
    acc[lib].push(asset);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-theme-primary mx-auto mb-4" />
          <p className="text-theme-muted">Loading missing assets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-theme-text flex items-center gap-3">
            <AlertCircle className="w-8 h-8 text-orange-500" />
            Asset Overview
          </h1>
          <p className="text-theme-muted mt-2">
            Overview of all assets with detailed categorization
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-theme-primary text-white rounded-lg hover:bg-theme-primary/90 transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-theme-card border-2 border-theme-primary/30 rounded-lg p-4 shadow-lg">
          <div className="text-3xl font-bold text-theme-primary">
            {stats.total}
          </div>
          <div className="text-sm text-theme-muted font-medium mt-1">
            Assets with Issues
          </div>
        </div>
        <div
          className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-2 border-red-500/30 rounded-lg p-4 cursor-pointer hover:border-red-500/60 hover:shadow-lg transition-all"
          onClick={() =>
            setFilterCategory(filterCategory === "missing" ? "all" : "missing")
          }
        >
          <div className="flex items-center gap-2 mb-2">
            <FileX className="w-5 h-5 text-red-400" />
            <div className="text-3xl font-bold text-red-400">
              {stats.missing}
            </div>
          </div>
          <div className="text-sm text-red-300 font-medium">Missing Assets</div>
        </div>
        <div
          className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-2 border-yellow-500/30 rounded-lg p-4 cursor-pointer hover:border-yellow-500/60 hover:shadow-lg transition-all"
          onClick={() =>
            setFilterCategory(
              filterCategory === "non-primary-language"
                ? "all"
                : "non-primary-language"
            )
          }
        >
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-5 h-5 text-yellow-400" />
            <div className="text-3xl font-bold text-yellow-400">
              {stats.nonPrimaryLanguage}
            </div>
          </div>
          <div className="text-sm text-yellow-300 font-medium">
            Non-Primary Lang
          </div>
        </div>
        <div
          className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-2 border-orange-500/30 rounded-lg p-4 cursor-pointer hover:border-orange-500/60 hover:shadow-lg transition-all"
          onClick={() =>
            setFilterCategory(
              filterCategory === "non-primary-provider"
                ? "all"
                : "non-primary-provider"
            )
          }
        >
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-5 h-5 text-orange-400" />
            <div className="text-3xl font-bold text-orange-400">
              {stats.nonPrimaryProvider}
            </div>
          </div>
          <div className="text-sm text-orange-300 font-medium">
            Non-Primary Provider
          </div>
        </div>
        <div
          className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-2 border-purple-500/30 rounded-lg p-4 cursor-pointer hover:border-purple-500/60 hover:shadow-lg transition-all"
          onClick={() =>
            setFilterCategory(
              filterCategory === "truncated" ? "all" : "truncated"
            )
          }
        >
          <div className="flex items-center gap-2 mb-2">
            <Type className="w-5 h-5 text-purple-400" />
            <div className="text-3xl font-bold text-purple-400">
              {stats.truncated}
            </div>
          </div>
          <div className="text-sm text-purple-300 font-medium">
            Truncated Text
          </div>
        </div>
        <div
          className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-2 border-blue-500/30 rounded-lg p-4 cursor-pointer hover:border-blue-500/60 hover:shadow-lg transition-all"
          onClick={() =>
            setFilterCategory(filterCategory === "manual" ? "all" : "manual")
          }
        >
          <div className="flex items-center gap-2 mb-2">
            <Edit className="w-5 h-5 text-blue-400" />
            <div className="text-3xl font-bold text-blue-400">
              {stats.manual}
            </div>
          </div>
          <div className="text-sm text-blue-300 font-medium">Manual</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-theme-card rounded-lg border border-theme-border p-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by title or path..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-theme-bg border border-theme-primary/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="bg-theme-card border border-theme rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Type Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-theme-background border border-theme rounded-lg text-theme-text focus:outline-none focus:ring-2 focus:ring-theme-primary appearance-none"
            >
              <option value="all">All Types</option>
              <option value="poster">Posters (Movie/Season)</option>
              <option value="background">Backgrounds</option>
              <option value="season">Seasons</option>
              <option value="titlecard">Title Cards (Episodes)</option>
            </select>
          </div>

          {/* Library Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
            <select
              value={filterLibrary}
              onChange={(e) => setFilterLibrary(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-theme-background border border-theme rounded-lg text-theme-text focus:outline-none focus:ring-2 focus:ring-theme-primary appearance-none"
            >
              <option value="all">All Libraries</option>
              {libraries.map((lib) => (
                <option key={lib} value={lib}>
                  {lib}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-theme-background border border-theme rounded-lg text-theme-text focus:outline-none focus:ring-2 focus:ring-theme-primary appearance-none"
            >
              <option value="all">All Categories</option>
              <option value="missing">Missing Assets</option>
              <option value="non-primary-language">Non-Primary Language</option>
              <option value="non-primary-provider">Non-Primary Provider</option>
              <option value="truncated">Truncated Text</option>
              <option value="manual">Manually Created</option>
            </select>
          </div>
        </div>
      </div>

      {/* Assets List */}
      {filteredAssets.length === 0 ? (
        <div className="text-center py-12 bg-theme-card border border-theme rounded-lg">
          <AlertCircle className="w-12 h-12 text-theme-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium text-theme-text mb-2">
            {assets.filter((a) => categorizeAsset(a).length > 0).length === 0
              ? "🎉 Perfect! No Issues Found"
              : "No Assets Found"}
          </h3>
          <p className="text-theme-muted">
            {assets.filter((a) => categorizeAsset(a).length > 0).length === 0
              ? "All assets are using primary language and provider!"
              : searchTerm ||
                filterType !== "all" ||
                filterLibrary !== "all" ||
                filterCategory !== "all"
              ? "Try adjusting your filters"
              : "No assets with issues found"}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByLibrary).map(([library, libraryAssets]) => (
            <div
              key={library}
              className="bg-theme-card border border-theme rounded-lg overflow-hidden"
            >
              <div className="bg-theme-background px-4 py-3 border-b border-theme">
                <h3 className="font-semibold text-theme-text">
                  {library}{" "}
                  <span className="text-theme-muted text-sm">
                    ({libraryAssets.length} assets)
                  </span>
                </h3>
              </div>
              <div className="divide-y divide-theme">
                {libraryAssets.map((asset, index) => {
                  const categories = categorizeAsset(asset);
                  return (
                    <div
                      key={`${asset.title}-${index}`}
                      className="p-4 hover:bg-theme-hover transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        <div className={`mt-1 ${getTypeColor(asset.type)}`}>
                          {getTypeIcon(asset.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-theme-text truncate">
                            {asset.title}
                          </h4>

                          {/* Category Badges */}
                          {categories.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {categories.map((category) => {
                                const badge = getCategoryBadge(
                                  category,
                                  asset.type
                                );
                                if (!badge) return null;
                                return (
                                  <span
                                    key={category}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${badge.className}`}
                                  >
                                    {badge.icon}
                                    {badge.label}
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex flex-wrap gap-3 mt-3 text-sm text-theme-muted">
                            <span className="flex items-center gap-1.5">
                              <span className="font-semibold text-theme-text/80">
                                Type:
                              </span>{" "}
                              <span className={getTypeColor(asset.type)}>
                                {asset.type}
                              </span>
                            </span>
                            {asset.language && (
                              <span className="flex items-center gap-1.5">
                                <span className="text-theme-muted/50">•</span>
                                <span className="font-semibold text-theme-text/80">
                                  Language:
                                </span>{" "}
                                <span className="uppercase font-mono">
                                  {asset.language}
                                </span>
                              </span>
                            )}
                            {asset.download_source &&
                              asset.download_source !== "N/A" && (
                                <span className="flex items-center gap-1.5">
                                  <span className="text-theme-muted/50">•</span>
                                  <span className="font-semibold text-theme-text/80">
                                    Source:
                                  </span>{" "}
                                  {asset.download_source}
                                </span>
                              )}
                          </div>
                          {asset.rootfolder && (
                            <div className="mt-2 text-xs text-theme-muted/60 truncate font-mono bg-theme-background/50 px-2 py-1 rounded">
                              {asset.rootfolder}
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex-shrink-0 flex gap-2">
                          <button
                            onClick={() => {
                              const transformedAsset =
                                transformAssetForReplacer(asset);
                              setAssetToReplace(transformedAsset);
                              setReplacerOpen(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/40 rounded-lg transition-all hover:shadow-lg group"
                            title="Replace asset with new image"
                          >
                            <RefreshCw className="w-4 h-4" />
                            <span className="hidden lg:inline text-sm font-medium">
                              Replace
                            </span>
                          </button>
                          <button
                            onClick={() => handleMarkAsChanged(asset)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/40 rounded-lg transition-all hover:shadow-lg group"
                            title="Mark as changed and remove from database"
                          >
                            <Check className="w-4 h-4" />
                            <span className="hidden lg:inline text-sm font-medium">
                              Changed & Remove
                            </span>
                            <span className="lg:hidden text-sm font-medium">
                              Remove
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Asset Replacer Modal */}
      {replacerOpen && assetToReplace && (
        <AssetReplacer
          asset={assetToReplace}
          onClose={() => {
            setReplacerOpen(false);
            setAssetToReplace(null);
          }}
          onSuccess={() => {
            showSuccess("Asset replaced successfully!");
            // Refresh the assets list
            loadAssets();
            setReplacerOpen(false);
            setAssetToReplace(null);
          }}
        />
      )}
    </div>
  );
};

export default MissingAssets;
