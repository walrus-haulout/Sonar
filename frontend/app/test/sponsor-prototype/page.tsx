'use client';

import { useState, useRef } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useSubWalletOrchestrator } from '@/hooks/useSubWalletOrchestrator';
import { useWalrusParallelUpload } from '@/hooks/useWalrusParallelUpload';
import { useSealEncryption } from '@/hooks/useSeal';

/**
 * Sponsor Prototype Test Page
 * Demonstrates the integrated upload flow:
 * 1. Ephemeral sub-wallet orchestration
 * 2. SEAL encryption
 * 3. Walrus upload (Blockberry API for now)
 */
export default function SponsorPrototypePage() {
  const currentAccount = useCurrentAccount();
  const orchestrator = useSubWalletOrchestrator();
  const { uploadBlob, progress } = useWalrusParallelUpload();
  const { isReady: sealReady, encrypt } = useSealEncryption();

  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (message: string) => {
    console.log(message);
    setLogs(prev => [...prev, `${new Date().toISOString().split('T')[1].slice(0, 8)} - ${message}`]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      addLog(`📁 File selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    }
  };

  const testIntegratedUpload = async () => {
    if (!currentAccount?.address) {
      setError('Please connect your wallet first');
      return;
    }

    if (!selectedFile) {
      setError('Please select a file first');
      return;
    }

    if (!sealReady) {
      setError('SEAL encryption not ready');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setLogs([]);

    try {
      // Step 1: Demonstrate orchestrator functionality
      addLog('🔧 Initializing Sub-Wallet Orchestrator...');
      const walletCount = orchestrator.calculateWalletCount(selectedFile.size);
      const strategy = orchestrator.isReady ?
        (selectedFile.size < 1024 * 1024 * 1024 ? 'blockberry' : 'sponsored-parallel') :
        'blockberry';

      addLog(`📊 File size: ${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`);
      addLog(`🎯 Upload strategy: ${strategy}`);
      addLog(`👥 Optimal wallet count: ${walletCount}`);

      // Create demo wallets (even though we're using Blockberry for now)
      const demoWallets = orchestrator.createWallets(Math.min(walletCount, 4));
      addLog(`✅ Created ${demoWallets.length} ephemeral demo wallets (RAM-only)`);
      demoWallets.forEach((wallet, i) => {
        addLog(`   Wallet ${i + 1}: ${wallet.address.slice(0, 10)}...`);
      });

      // Step 2: SEAL Encryption
      addLog('🔐 Encrypting file with Mysten SEAL...');
      const encryptionResult = await encrypt(
        selectedFile,
        {
          accessPolicy: 'purchase',
          // Skip packageId for now - will integrate SEAL policies later
        },
        (progressPercent) => {
          if (progressPercent % 25 === 0) {
            addLog(`   Encryption progress: ${progressPercent}%`);
          }
        }
      );
      addLog(`✅ Encryption complete!`);
      addLog(`   Policy ID: ${encryptionResult.identity.slice(0, 20)}...`);
      addLog(`   Encrypted size: ${(encryptionResult.encryptedData.byteLength / 1024).toFixed(2)} KB`);

      // Step 3: Walrus Upload (Blockberry)
      addLog('📤 Uploading to Walrus via Blockberry API...');
      const encryptedBlob = new Blob([new Uint8Array(encryptionResult.encryptedData)]);

      const uploadResult = await uploadBlob(
        encryptedBlob,
        encryptionResult.identity,
        encryptionResult.metadata as Record<string, unknown>
      );

      addLog(`✅ Upload complete!`);
      addLog(`   Blob ID: ${uploadResult.blobId}`);
      addLog(`   Strategy used: ${uploadResult.strategy}`);

      // Step 4: Cleanup
      addLog('🧹 Cleaning up ephemeral wallets...');
      orchestrator.discardAllWallets();
      addLog(`✅ Discarded ${demoWallets.length} wallets (no sweeping needed)`);

      setResult({
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        strategy: uploadResult.strategy,
        blobId: uploadResult.blobId,
        previewBlobId: uploadResult.previewBlobId,
        seal_policy_id: uploadResult.seal_policy_id,
        walletsCreated: demoWallets.length,
        optimalWalletCount: walletCount,
      });

      addLog('🎉 SUCCESS! Complete upload flow works!');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      addLog(`❌ ERROR: ${errorMessage}`);
      setError(errorMessage);
      console.error('Upload flow error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-sonar-abyss p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-mono font-bold text-sonar-highlight-bright">
            Integrated Upload Test
          </h1>
          <p className="text-sonar-highlight/70">
            Testing complete flow: Sub-Wallets → SEAL Encryption → Walrus Upload
          </p>
        </div>

        {/* Connection Status */}
        <div className="glass-panel rounded-sonar p-6">
          <h2 className="text-lg font-mono font-semibold text-sonar-signal mb-3">
            System Status
          </h2>
          <div className="space-y-2 text-sm font-mono">
            {currentAccount ? (
              <p className="text-sonar-highlight-bright">
                ✅ Wallet: {currentAccount.address.slice(0, 20)}...
              </p>
            ) : (
              <p className="text-sonar-coral">⚠️ Please connect your wallet</p>
            )}
            <p className={sealReady ? 'text-sonar-highlight-bright' : 'text-sonar-coral'}>
              {sealReady ? '✅' : '⏳'} SEAL Encryption: {sealReady ? 'Ready' : 'Loading...'}
            </p>
            <p className={orchestrator.isReady ? 'text-sonar-highlight-bright' : 'text-sonar-highlight/50'}>
              {orchestrator.isReady ? '✅' : '⚠️'} Sub-Wallet Orchestrator: {orchestrator.isReady ? 'Ready' : 'Waiting for wallet'}
            </p>
            {orchestrator.walletCount > 0 && (
              <p className="text-sonar-blue">
                👥 Active Wallets: {orchestrator.walletCount}
              </p>
            )}
          </div>
        </div>

        {/* File Upload */}
        <div className="glass-panel rounded-sonar p-6">
          <h2 className="text-lg font-mono font-semibold text-sonar-signal mb-4">
            1. Select File
          </h2>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            accept="audio/*"
            className="hidden"
          />
          <div className="space-y-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className={`
                px-6 py-3 rounded-sonar font-mono font-semibold
                transition-all duration-200
                ${isProcessing
                  ? 'bg-sonar-blue/20 text-sonar-highlight/50 cursor-not-allowed'
                  : 'bg-sonar-blue hover:bg-sonar-blue/80 text-sonar-highlight-bright'
                }
              `}
            >
              Choose Audio File
            </button>
            {selectedFile && (
              <div className="text-sm font-mono text-sonar-highlight-bright">
                📁 {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </div>
            )}
          </div>
        </div>

        {/* Test Button */}
        <div className="glass-panel rounded-sonar p-6">
          <h2 className="text-lg font-mono font-semibold text-sonar-signal mb-4">
            2. Run Integrated Upload Test
          </h2>
          <button
            onClick={testIntegratedUpload}
            disabled={!currentAccount || !sealReady || !selectedFile || isProcessing}
            className={`
              px-6 py-3 rounded-sonar font-mono font-semibold
              transition-all duration-200 w-full
              ${!currentAccount || !sealReady || !selectedFile || isProcessing
                ? 'bg-sonar-blue/20 text-sonar-highlight/50 cursor-not-allowed'
                : 'bg-sonar-signal hover:bg-sonar-signal/80 text-sonar-abyss'
              }
            `}
          >
            {isProcessing ? 'Processing Upload...' : 'Start Upload Test'}
          </button>
        </div>

        {/* Logs */}
        {logs.length > 0 && (
          <div className="glass-panel rounded-sonar p-6">
            <h2 className="text-lg font-mono font-semibold text-sonar-signal mb-4">
              Execution Log
            </h2>
            <div className="bg-sonar-abyss/50 rounded p-4 space-y-1 max-h-96 overflow-y-auto">
              {logs.map((log, i) => (
                <p key={i} className="text-xs font-mono text-sonar-highlight/80">
                  {log}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="glass-panel rounded-sonar p-6 bg-sonar-signal/5">
            <h2 className="text-lg font-mono font-semibold text-sonar-signal mb-4">
              ✅ Upload Success!
            </h2>
            <div className="space-y-2 text-sm font-mono">
              <p className="text-sonar-highlight-bright">
                <span className="text-sonar-highlight/70">File:</span> {result.fileName}
              </p>
              <p className="text-sonar-highlight-bright">
                <span className="text-sonar-highlight/70">Size:</span> {(result.fileSize / 1024 / 1024).toFixed(2)} MB
              </p>
              <p className="text-sonar-highlight-bright">
                <span className="text-sonar-highlight/70">Strategy:</span> {result.strategy}
              </p>
              <p className="text-sonar-highlight-bright">
                <span className="text-sonar-highlight/70">Blob ID:</span> {result.blobId}
              </p>
              {result.previewBlobId && (
                <p className="text-sonar-highlight-bright">
                  <span className="text-sonar-highlight/70">Preview Blob ID:</span> {result.previewBlobId}
                </p>
              )}
              <p className="text-sonar-highlight-bright">
                <span className="text-sonar-highlight/70">SEAL Policy:</span> {result.seal_policy_id.slice(0, 30)}...
              </p>
              <p className="text-sonar-highlight-bright">
                <span className="text-sonar-highlight/70">Wallets Created:</span> {result.walletsCreated} (optimal: {result.optimalWalletCount})
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="glass-panel rounded-sonar p-6 bg-sonar-coral/10 border-2 border-sonar-coral">
            <h2 className="text-lg font-mono font-semibold text-sonar-coral mb-2">
              Error
            </h2>
            <p className="text-sm font-mono text-sonar-coral">{error}</p>
          </div>
        )}

        {/* Info */}
        <div className="glass-panel rounded-sonar p-6 bg-sonar-blue/5">
          <h2 className="text-lg font-mono font-semibold text-sonar-blue mb-2">
            Complete Upload Flow
          </h2>
          <ol className="text-sm text-sonar-highlight/80 space-y-2 list-decimal list-inside">
            <li><strong>Sub-Wallet Orchestration:</strong> Creates ephemeral wallets (RAM-only, throwaway)</li>
            <li><strong>Strategy Selection:</strong> Auto-selects Blockberry (&lt;1GB) or Sponsored (&ge;1GB)</li>
            <li><strong>SEAL Encryption:</strong> Client-side encryption with Mysten SEAL</li>
            <li><strong>Walrus Upload:</strong> Uploads encrypted blob to Walrus network</li>
            <li><strong>Cleanup:</strong> Discards ephemeral wallets (no sweeping needed)</li>
          </ol>
          <div className="mt-4 p-3 bg-sonar-signal/10 rounded-sonar">
            <p className="text-xs font-mono text-sonar-highlight/70">
              <strong className="text-sonar-signal">Note:</strong> Currently using Blockberry API for all uploads.
              Sponsored parallel uploads (for files ≥1GB) require server-side orchestration.
              See <code className="text-sonar-blue">/docs/SPONSOR_TRANSACTIONS.md</code> for details.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
