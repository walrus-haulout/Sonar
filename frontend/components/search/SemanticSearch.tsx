'use client';

import React, { useState, useCallback } from 'react';
import { Search, Loader2, AlertCircle } from 'lucide-react';

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
}

interface SemanticSearchProps {
  onResultsChange?: (results: SearchResult[]) => void;
  maxResults?: number;
}

export function SemanticSearch({
  onResultsChange,
  maxResults = 10,
}: SemanticSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

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
        const response = await fetch('/api/search/semantic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: query.trim(),
            limit: maxResults,
            threshold: 0.7,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || 'Failed to perform search'
          );
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
    [query, maxResults, onResultsChange]
  );

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
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
            placeholder="Search for datasets by description, title, or content..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

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
          No datasets found matching your query. Try different keywords.
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Found {results.length} similar dataset{results.length !== 1 ? 's' : ''}
          </p>

          {results.map((result, idx) => (
            <ResultCard key={idx} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: SearchResult }) {
  if (!result.dataset) {
    return null;
  }

  const { dataset, similarity_score } = result;
  const similarityPercent = Math.round(similarity_score * 100);

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
            {dataset.languages?.map((lang) => (
              <span
                key={lang}
                className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
              >
                {lang}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
            <span>Creator: {dataset.creator}</span>
            <span>Quality: {dataset.quality_score}/100</span>
            <span>Purchases: {dataset.total_purchases}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">
              {similarityPercent}%
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
