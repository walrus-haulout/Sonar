'use client';

import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useSignPersonalMessage } from '@mysten/dapp-kit';
import { SonarButton } from '@/components/ui/SonarButton';
import type { Dataset } from '@/types/blockchain';
import { useWaveform } from '@/hooks/useWaveform';
import { useAuth } from '@/hooks/useAuth';
import { getStreamUrl, getPreviewUrl, requestAccessGrant } from '@/lib/api/client';
import { useSealDecryption, type DecryptionProgress } from '@/hooks/useSeal';
import type { AccessGrant } from '@/types/blockchain';

interface AudioPlayerProps {
  dataset: Dataset;
}

/**
 * AudioPlayer Component
 * Displays waveform visualization and playback controls with real audio
 * Supports both server streaming (legacy) and browser-side Seal decryption
 * Integrates Wavesurfer.js for accurate peak visualization and playback
 */
export function AudioPlayer({ dataset }: AudioPlayerProps) {
  const [volume, setVolume] = useState(1);
  const [mode, setMode] = useState<'preview' | 'stream' | 'decrypt'>('preview');
  const [decryptedAudioUrl, setDecryptedAudioUrl] = useState<string | null>(null);
  const [accessGrant, setAccessGrant] = useState<AccessGrant | null>(null);
  const [decryptProgress, setDecryptProgress] = useState<DecryptionProgress | null>(null);

  const waveformRef = useRef<HTMLDivElement>(null);
  const { token, isAuthenticated, isTokenValid } = useAuth();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  const {
    isClientReady: sealClientReady,
    hasSession,
    isDecrypting,
    decryptAudio,
    createSession,
  } = useSealDecryption();

  // Use direct preview URL if available, otherwise use backend endpoint
  const previewUrl = dataset.previewUrl || getPreviewUrl(dataset.id);

  // Use stream URL (requires JWT) if user is authenticated (fallback mode)
  const streamUrl = isAuthenticated && isTokenValid() ? getStreamUrl(dataset.id, token || '') : null;

  // For authenticated users, pass Authorization header
  const fetchOptions = streamUrl && token ? ({
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  } as RequestInit) : undefined;

  // Determine which audio source to use
  const audioSrc = useMemo(() => {
    if (mode === 'decrypt' && decryptedAudioUrl) {
      return decryptedAudioUrl;
    }
    if (mode === 'stream' && streamUrl) {
      return streamUrl;
    }
    return previewUrl;
  }, [mode, decryptedAudioUrl, streamUrl, previewUrl]);

  // Initialize waveform hook for playback
  const waveform = useWaveform({
    src: audioSrc,
    sliceCount: 50, // Match current bar count
    autoplay: false,
    preload: mode === 'preview', // Only preload preview
    fetchOptions: mode === 'stream' ? fetchOptions : undefined,
  });

  /**
   * Cleanup decrypted audio URL on unmount
   */
  useEffect(() => {
    return () => {
      if (decryptedAudioUrl) {
        URL.revokeObjectURL(decryptedAudioUrl);
      }
    };
  }, [decryptedAudioUrl]);


  /**
   * Handle unlocking full audio with browser-side decryption
   */
  const handleUnlockAudio = useCallback(async () => {
    if (!isAuthenticated || !isTokenValid() || !token) {
      console.error('[AudioPlayer] User not authenticated');
      setDecryptProgress({
        stage: 'error',
        progress: 0,
        message: 'Authentication required',
        error: 'Please log in to unlock full audio',
      });
      return;
    }

    console.log('[AudioPlayer] Starting browser decryption flow', {
      datasetId: dataset.id,
      hasSession,
    });

    try {
      // Step 1: Create Seal session if needed
      if (!hasSession) {
        console.log('[AudioPlayer] Creating new Seal session');
        setDecryptProgress({
          stage: 'fetching',
          progress: 5,
          message: 'Creating secure session...',
        });

        try {
          await createSession({
            signMessage: async (message: Uint8Array) => {
              const result = await signPersonalMessage({ message });
              return { signature: result.signature };
            },
          });
          console.log('[AudioPlayer] Seal session created successfully');
        } catch (sessionError) {
          console.error('[AudioPlayer] Failed to create Seal session:', sessionError);
          throw new Error(
            sessionError instanceof Error && sessionError.message.includes('User rejected')
              ? 'Wallet signature required to create secure session'
              : 'Failed to create secure session. Please try again.'
          );
        }
      }

      // Step 2: Request access grant to get blob_id and seal_policy_id
      console.log('[AudioPlayer] Requesting access grant');
      setDecryptProgress({
        stage: 'fetching',
        progress: 10,
        message: 'Verifying purchase and requesting access...',
      });

      let grant: AccessGrant;
      try {
        grant = await requestAccessGrant(dataset.id, token);
        setAccessGrant(grant);
        console.log('[AudioPlayer] Access grant received', {
          blobId: grant.blob_id,
          policyId: grant.seal_policy_id,
        });
      } catch (accessError) {
        console.error('[AudioPlayer] Access grant denied:', accessError);
        throw new Error(
          accessError instanceof Error && accessError.message.includes('purchase')
            ? 'Purchase required to access full audio'
            : 'Access denied. Please verify your purchase.'
        );
      }

      // Step 3: Decrypt the audio with policy verification
      console.log('[AudioPlayer] Starting decryption', {
        policyModule: 'purchase_policy',
        policyId: grant.seal_policy_id,
      });

      const decryptedData = await decryptAudio({
        blobId: grant.blob_id,
        sealPolicyId: grant.seal_policy_id,
        policyModule: 'purchase_policy',
        onProgress: (progress) => {
          setDecryptProgress(progress);
          console.log('[AudioPlayer] Decryption progress:', progress);
        },
      });

      console.log('[AudioPlayer] Decryption successful', {
        decryptedSize: decryptedData.length,
        decryptedSizeMB: (decryptedData.length / 1024 / 1024).toFixed(2),
      });

      // Step 4: Create Blob URL for playback
      // Convert Uint8Array to Blob for playback
      const audioBlob = new Blob([decryptedData as unknown as BlobPart], { type: 'audio/mpeg' });
      const blobUrl = URL.createObjectURL(audioBlob);
      waveform.destroy();
      setDecryptedAudioUrl(blobUrl);
      setMode('decrypt');

      console.log('[AudioPlayer] Browser decryption complete, loading waveform');

    } catch (error) {
      console.error('[AudioPlayer] Decryption flow failed:', error);

      // Provide user-friendly error messages
      let userMessage = 'Failed to unlock audio';
      let technicalError = error instanceof Error ? error.message : 'Unknown error';

      if (technicalError.includes('policy')) {
        userMessage = 'Access policy verification failed';
        technicalError = 'The on-chain policy denied access. Please verify your purchase.';
      } else if (technicalError.includes('key share') || technicalError.includes('key server')) {
        userMessage = 'Key server unavailable';
        technicalError = 'Could not retrieve decryption keys. Please check your network and try again.';
      } else if (technicalError.includes('blob') || technicalError.includes('Walrus')) {
        userMessage = 'Failed to fetch encrypted audio';
        technicalError = 'Could not download encrypted data from Walrus. Please try again.';
      }

      setDecryptProgress({
        stage: 'error',
        progress: 0,
        message: userMessage,
        error: technicalError,
      });
    }
  }, [
    isAuthenticated,
    isTokenValid,
    token,
    hasSession,
    createSession,
    signPersonalMessage,
    dataset.id,
    decryptAudio,
    waveform,
  ]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = waveform.progress;

  // Handle seeking by clicking on waveform
  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || waveform.duration === 0) return;

    const rect = waveformRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickProgress = x / rect.width;
    const seekTime = clickProgress * waveform.duration;

    waveform.seek(seekTime);
  };

  // Handle volume change
  const handleVolumeClick = () => {
    const newVolume = volume > 0 ? 0 : 1;
    setVolume(newVolume);
    waveform.setVolume(newVolume);
  };

  return (
    <div className="space-y-4">
      {/* Waveform Visualization */}
      <div
        ref={waveformRef}
        onClick={handleWaveformClick}
        className="relative w-full h-32 bg-sonar-abyss/50 rounded-sonar overflow-hidden border border-sonar-signal/20 cursor-pointer hover:border-sonar-signal/40 transition-colors"
      >
        {/* Waveform bars - real peaks from audio */}
        <div className="flex items-center justify-center h-full gap-1 px-4">
          {waveform.peaks ? (
            // Render real peaks when available
            waveform.peaks.map((height, index) => {
              const isPassed = (index / waveform.peaks!.length) * 100 < progress;
              return (
                <div
                  key={index}
                  className={`flex-1 rounded-full transition-colors ${
                    isPassed ? 'bg-sonar-signal' : 'bg-sonar-highlight/30'
                  }`}
                  style={{
                    height: `${height * 100}%`,
                    maxWidth: '4px',
                  }}
                />
              );
            })
          ) : (
            // Loading placeholder - show empty bars
            Array.from({ length: 50 }).map((_, index) => (
              <div
                key={index}
                className="flex-1 rounded-full bg-sonar-highlight/20 animate-pulse"
                style={{
                  height: '40%',
                  maxWidth: '4px',
                }}
              />
            ))
          )}
        </div>

        {/* Play progress overlay */}
        <div
          className="absolute top-0 left-0 h-full bg-sonar-signal/10 pointer-events-none transition-all"
          style={{ width: `${progress}%` }}
        />

        {/* Loading state */}
        {waveform.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-sonar-abyss/70">
            <p className="text-sm text-sonar-highlight-bright/50 font-mono">
              Loading audio...
            </p>
          </div>
        )}

        {/* Placeholder text when not playing and no progress */}
        {!waveform.isPlaying && waveform.currentTime === 0 && !waveform.isLoading && waveform.peaks && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-xs text-sonar-highlight-bright/30 font-mono">
              Click waveform to seek
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center space-x-4">
        {/* Play/Pause Button */}
        <SonarButton
          variant="primary"
          onClick={waveform.playPause}
          disabled={waveform.isLoading}
          className="w-12 h-12 rounded-full flex items-center justify-center"
        >
          {waveform.isPlaying ? (
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 ml-0.5"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </SonarButton>

        {/* Timeline */}
        <div className="flex-1">
          {/* Progress Bar */}
          <div
            className="relative w-full h-2 bg-sonar-abyss/50 rounded-full overflow-hidden mb-2 cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const clickProgress = x / rect.width;
              const seekTime = clickProgress * waveform.duration;
              waveform.seek(seekTime);
            }}
          >
            <div
              className="h-full bg-sonar-signal transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Time Display */}
          <div className="flex justify-between text-xs font-mono text-sonar-highlight-bright/60">
            <span>{formatTime(waveform.currentTime)}</span>
            <span>{formatTime(waveform.duration || dataset.duration_seconds)}</span>
          </div>
        </div>

        {/* Volume Control */}
        <button
          onClick={handleVolumeClick}
          className="flex items-center space-x-2 text-sonar-highlight-bright/60 hover:text-sonar-signal transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            {volume > 0 ? (
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            ) : (
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            )}
          </svg>
        </button>
      </div>

      {/* Format Info */}
      <div className="text-xs text-sonar-highlight-bright/50 font-mono">
        Available formats: {dataset.formats.join(', ')} • Sample rate: 44.1kHz • Bit depth: 16-bit
      </div>

      {/* Unlock Full Audio Button (for authenticated users with purchase) */}
      {isAuthenticated && isTokenValid() && mode === 'preview' && (
        <div className="space-y-3">
          <SonarButton
            variant="primary"
            onClick={handleUnlockAudio}
            disabled={isDecrypting || !sealClientReady}
            className="w-full"
          >
            {isDecrypting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Unlocking...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
                Unlock Full Audio (Browser Decryption)
              </>
            )}
          </SonarButton>

          {/* Decryption Progress */}
          {decryptProgress && (
            <div className="p-3 rounded-sonar border border-sonar-signal/20 bg-sonar-signal/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-sonar-highlight">
                  {decryptProgress.message}
                </span>
                <span className="text-xs font-mono text-sonar-signal">
                  {decryptProgress.progress}%
                </span>
              </div>
              {decryptProgress.stage !== 'error' && (
                <div className="w-full bg-sonar-abyss/50 rounded-full h-1.5">
                  <div
                    className="bg-sonar-signal h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${decryptProgress.progress}%` }}
                  />
                </div>
              )}
              {decryptProgress.error && (
                <p className="text-xs text-sonar-coral mt-2">{decryptProgress.error}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Note about access status */}
      <div className={`p-3 rounded-sonar border ${
        mode === 'decrypt'
          ? 'bg-sonar-signal/5 border-sonar-signal/20'
          : mode === 'stream'
            ? 'bg-sonar-signal/5 border-sonar-signal/20'
            : 'bg-sonar-highlight/5 border-sonar-highlight/20'
      }`}>
        <p className="text-xs text-sonar-highlight-bright/70">
          {mode === 'decrypt' ? (
            <>
              <span className="font-mono text-sonar-signal">✓ Browser Decryption:</span> Playing fully
              decrypted audio. Encrypted data fetched from Walrus and decrypted in your browser using
              Mysten Seal with zero-knowledge key shares.
            </>
          ) : mode === 'stream' ? (
            <>
              <span className="font-mono text-sonar-signal">✓ Server Streaming:</span> Playing purchased
              audio via server. Use browser decryption for enhanced privacy.
            </>
          ) : (
            <>
              <span className="font-mono text-sonar-highlight">ⓘ Preview Mode:</span> Full audio
              access requires dataset purchase. Encrypted audio is stored on Walrus and can be decrypted
              in your browser with Mysten Seal upon purchase.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
