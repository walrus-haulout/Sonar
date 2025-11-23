"use client";

import { useState } from "react";

export const dynamic = "force-dynamic";
export const runtime = "edge";
import { Upload } from "lucide-react";
import { useDatasets, useFeaturedDatasets } from "@/hooks/useDatasets";
import { DatasetCard } from "@/components/marketplace/DatasetCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { GlassCard } from "@/components/ui/GlassCard";
import { SonarButton } from "@/components/ui/SonarButton";
import { SonarBackground } from "@/components/animations/SonarBackground";
import { UploadWizard } from "@/components/upload/UploadWizard";
import type { DatasetFilter } from "@/types/blockchain";

/**
 * Marketplace Page
 * Browse and filter audio datasets
 */
export default function MarketplacePage() {
  const [filter, setFilter] = useState<DatasetFilter>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [minQuality, setMinQuality] = useState<number>(0);
  const [showUploadWizard, setShowUploadWizard] = useState(false);

  // Fetch datasets with current filter
  const { data: datasets, isLoading, error } = useDatasets(filter);
  const { data: featured } = useFeaturedDatasets(6);

  // Available languages (hardcoded for now, could be fetched from API)
  const availableLanguages = [
    "en",
    "es",
    "fr",
    "de",
    "ja",
    "zh",
    "ko",
    "ar",
    "ru",
    "hi",
    "it",
    "pt",
  ];

  // Handle language filter toggle
  const toggleLanguage = (lang: string) => {
    const newLanguages = selectedLanguages.includes(lang)
      ? selectedLanguages.filter((l) => l !== lang)
      : [...selectedLanguages, lang];

    setSelectedLanguages(newLanguages);
    setFilter({
      ...filter,
      languages: newLanguages.length > 0 ? newLanguages : undefined,
    });
  };

  // Handle quality filter
  const handleQualityChange = (quality: number) => {
    setMinQuality(quality);
    setFilter({
      ...filter,
      min_quality: quality > 0 ? quality : undefined,
    });
  };

  // Client-side search through title/description
  const filteredDatasets = datasets?.filter(
    (dataset) =>
      !searchQuery ||
      dataset.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dataset.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <main className="relative min-h-screen">
      {/* Background Animation */}
      <SonarBackground opacity={0.2} intensity={0.5} />

      <div className="relative z-10 container mx-auto px-6 py-12">
        {/* Page Header */}
        <div className="max-w-6xl mx-auto mb-12">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-5xl font-mono tracking-radar text-sonar-highlight mb-4">
                Marketplace
              </h1>
              <p className="text-xl text-sonar-highlight-bright/80">
                Browse high-quality audio datasets across all categories
              </p>
            </div>
            <SonarButton
              variant="primary"
              onClick={() => setShowUploadWizard(true)}
              className="flex items-center space-x-2"
            >
              <Upload className="w-5 h-5" />
              <span>Upload Dataset</span>
            </SonarButton>
          </div>
        </div>

        {/* Featured Datasets */}
        {featured && featured.length > 0 && (
          <div className="max-w-6xl mx-auto mb-12">
            <h2 className="text-2xl font-mono text-sonar-highlight mb-6">
              ⭐ Featured Datasets
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featured.map((dataset) => (
                <DatasetCard key={dataset.id} dataset={dataset} />
              ))}
            </div>
          </div>
        )}

        {/* Filters + Results */}
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar Filters */}
            <aside className="lg:col-span-1">
              <GlassCard className="sticky top-24">
                <h3 className="text-lg font-mono text-sonar-highlight mb-4">
                  Filters
                </h3>

                {/* Search */}
                <div className="mb-6">
                  <label className="block text-sm text-sonar-highlight-bright/70 mb-2">
                    Search
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search datasets..."
                    className="w-full px-3 py-2 bg-sonar-abyss/50 border border-sonar-signal/30 rounded-sonar text-sonar-highlight-bright placeholder-sonar-highlight-bright/40 focus:outline-none focus:ring-2 focus:ring-sonar-signal"
                  />
                </div>

                {/* Quality Filter */}
                <div className="mb-6">
                  <label className="block text-sm text-sonar-highlight-bright/70 mb-2">
                    Minimum Quality: {minQuality > 0 ? minQuality : "Any"}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={minQuality}
                    onChange={(e) =>
                      handleQualityChange(parseInt(e.target.value))
                    }
                    className="w-full accent-sonar-signal"
                  />
                  <div className="flex justify-between text-xs text-sonar-highlight-bright/50 mt-1">
                    <span>Any</span>
                    <span>10</span>
                  </div>
                </div>

                {/* Language Filter */}
                <div className="mb-6">
                  <label className="block text-sm text-sonar-highlight-bright/70 mb-3">
                    Languages
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {availableLanguages.map((lang) => (
                      <label
                        key={lang}
                        className="flex items-center space-x-2 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={selectedLanguages.includes(lang)}
                          onChange={() => toggleLanguage(lang)}
                          className="w-4 h-4 accent-sonar-signal"
                        />
                        <span className="text-sm text-sonar-highlight-bright/70 group-hover:text-sonar-highlight-bright font-mono">
                          {lang.toUpperCase()}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Clear Filters */}
                {(selectedLanguages.length > 0 ||
                  minQuality > 0 ||
                  searchQuery) && (
                  <SonarButton
                    variant="secondary"
                    onClick={() => {
                      setSelectedLanguages([]);
                      setMinQuality(0);
                      setSearchQuery("");
                      setFilter({});
                    }}
                    className="w-full text-sm"
                  >
                    Clear Filters
                  </SonarButton>
                )}
              </GlassCard>
            </aside>

            {/* Results Grid */}
            <div className="lg:col-span-3">
              {/* Results Header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-mono text-sonar-highlight">
                  {isLoading
                    ? "Loading..."
                    : `${filteredDatasets?.length || 0} Datasets`}
                </h3>

                {/* Sort Options - Placeholder for now */}
                <select className="px-3 py-2 bg-sonar-abyss/50 border border-sonar-signal/30 rounded-sonar text-sonar-highlight-bright text-sm focus:outline-none focus:ring-2 focus:ring-sonar-signal">
                  <option>Sort: Quality (High)</option>
                  <option>Sort: Price (Low)</option>
                  <option>Sort: Price (High)</option>
                  <option>Sort: Duration</option>
                </select>
              </div>

              {/* Loading State */}
              {isLoading && (
                <div className="flex justify-center items-center py-20">
                  <LoadingSpinner />
                </div>
              )}

              {/* Error State */}
              {error && (
                <GlassCard className="text-center py-12">
                  <p className="text-sonar-coral text-lg mb-2">
                    Failed to load datasets
                  </p>
                  <p className="text-sm text-sonar-highlight-bright/50">
                    {error.message}
                  </p>
                </GlassCard>
              )}

              {/* Empty State */}
              {!isLoading && !error && filteredDatasets?.length === 0 && (
                <GlassCard className="text-center py-12">
                  <p className="text-sonar-highlight text-lg mb-2">
                    No datasets found
                  </p>
                  <p className="text-sm text-sonar-highlight-bright/50">
                    Try adjusting your filters
                  </p>
                </GlassCard>
              )}

              {/* Dataset Grid */}
              {!isLoading &&
                !error &&
                filteredDatasets &&
                filteredDatasets.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filteredDatasets.map((dataset) => (
                      <DatasetCard key={dataset.id} dataset={dataset} />
                    ))}
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>

      {/* Upload Wizard Modal */}
      <UploadWizard
        open={showUploadWizard}
        onOpenChange={setShowUploadWizard}
      />
    </main>
  );
}
