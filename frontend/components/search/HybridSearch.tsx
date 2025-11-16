'use client';

import React, { useState, useCallback } from 'react';
import { Search, Loader2, AlertCircle, Filter } from 'lucide-react';

interface Dataset {
  id: string;
  title: string;
  description: string;
  creator: string;
  quality_score: number;
  price: string | bigint;
  languages: string[];
  created_at: string;
  total_purchases: number;
}

interface SearchResult {
  similarity_score: number;
  dataset: Dataset | null;
  metadata?: Record<string, any>;
  score: number;
}

interface HybridSearchProps {
  onResultsChange?: (results: SearchResult[]) => void;
  maxResults?: number;
}

const COMMON_LANGUAGES = [
  'English',
  'Spanish',
  'French',
  'German',
  'Mandarin',
  'Arabic',
];
const COMMON_TAGS = [
  'speech',
  'music',
  'nature',
  'urban',
  'voice',
  'ambient',
];

export function HybridSearch({
  onResultsChange,
  maxResults = 10,
}: HybridSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!query.trim()) {
        setError('Please enter a search query');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/search/hybrid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: query.trim(),
            languages: selectedLanguages,
            tags: selectedTags,
            limit: maxResults,
            threshold: 0.7,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to perform search');
        }

        const data = await response.json();
        setResults(data.results || []);
        setSearched(true);
        onResultsChange?.(data.results || []);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown error occurred';
        setError(message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [query, selectedLanguages, selectedTags, maxResults, onResultsChange]
  );

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Search Form */}
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by description, title, or keywords..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Searching...' : 'Search'}
          </button>

          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>
      </form>

      {/* Filters */}
      {showFilters && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-4">
          {/* Languages */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">
              Languages
            </label>
            <div className="flex flex-wrap gap-2">
              {COMMON_LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() =>
                    setSelectedLanguages(
                      selectedLanguages.includes(lang)
                        ? selectedLanguages.filter((l) => l !== lang)
                        : [...selectedLanguages, lang]
                    )
                  }
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    selectedLanguages.includes(lang)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">
              Tags
            </label>
            <div className="flex flex-wrap gap-2">
              {COMMON_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setSelectedTags(
                      selectedTags.includes(tag)
                        ? selectedTags.filter((t) => t !== tag)
                        : [...selectedTags, tag]
                    )
                  }
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Results */}
      {searched && results.length === 0 && !loading && !error && (
        <div className="text-center py-8 text-gray-500">
          No datasets found. Try different keywords or filters.
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Found {results.length} matching dataset{results.length !== 1 ? 's' : ''}
          </p>

          {results.map((result, idx) => (
            <HybridResultCard key={idx} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}

function HybridResultCard({ result }: { result: SearchResult }) {
  if (!result.dataset) {
    return null;
  }

  const { dataset, similarity_score, score } = result;
  const displayScore = Math.round((score || similarity_score || 0) * 100);

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <a
            href={`/datasets/${dataset.id}`}
            className="text-lg font-semibold text-blue-600 hover:underline truncate block"
          >
            {dataset.title}
          </a>
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
            {dataset.description}
          </p>

          <div className="flex flex-wrap gap-2 mt-3">
            {dataset.languages?.slice(0, 3).map((lang) => (
              <span
                key={lang}
                className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
              >
                {lang}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-4 mt-3 text-xs text-gray-600">
            <span>Creator: {dataset.creator}</span>
            <span>Quality: {dataset.quality_score}/100</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">
              {displayScore}%
            </div>
            <div className="text-xs text-gray-500">Match</div>
          </div>
          <a
            href={`/datasets/${dataset.id}`}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            View
          </a>
        </div>
      </div>
    </div>
  );
}
