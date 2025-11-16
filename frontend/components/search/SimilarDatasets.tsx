'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

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

interface SimilarResult {
  similarity_score: number;
  dataset: Dataset | null;
}

interface SimilarDatasetsProps {
  datasetId: string;
  limit?: number;
  threshold?: number;
}

export function SimilarDatasets({
  datasetId,
  limit = 5,
  threshold = 0.7,
}: SimilarDatasetsProps) {
  const [results, setResults] = useState<SimilarResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSimilar = async () => {
      try {
        const response = await fetch(
          `/api/datasets/${datasetId}/similar?limit=${limit}&threshold=${threshold}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch similar datasets');
        }

        const data = await response.json();
        setResults(data.similar_datasets || []);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown error occurred';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchSimilar();
  }, [datasetId, limit, threshold]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <p>{error}</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No similar datasets found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Similar Datasets</h3>

      {results.map((result, idx) => (
        <div
          key={idx}
          className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
        >
          {result.dataset && (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <a
                    href={`/datasets/${result.dataset.id}`}
                    className="text-base font-semibold text-blue-600 hover:underline"
                  >
                    {result.dataset.title}
                  </a>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                    {result.dataset.description}
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-xl font-bold text-blue-600">
                    {Math.round(result.similarity_score * 100)}%
                  </div>
                  <div className="text-xs text-gray-500">Match</div>
                </div>
              </div>

              <div className="flex gap-2 mt-2 text-xs text-gray-500">
                <span>{result.dataset.languages?.join(', ')}</span>
                <span>•</span>
                <span>Quality: {result.dataset.quality_score}/100</span>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
