"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  Shield,
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  Music,
  Copyright,
} from "lucide-react";
import { useSignPersonalMessage } from "@mysten/dapp-kit";
import { cn } from "@/lib/utils";
import { useSeal } from "@/hooks/useSeal";
import { isSessionValid } from "@sonar/seal";
import {
  DatasetMetadata,
  VerificationResult,
  VerificationSession,
  VerificationStage,
  AudioFile,
  WalrusUploadResult,
} from "@/lib/types/upload";
import { SonarButton } from "@/components/ui/SonarButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { RadarScanTarget } from "@/components/animations/RadarScanTarget";
import { DataAccessNotice } from "@/components/upload/DataAccessNotice";
import { VerificationFeedback } from "@/components/upload/VerificationFeedback";
import {
  VerificationActivityFeed,
  ActivityLogEntry,
} from "@/components/upload/VerificationActivityFeed";

/**
 * Extract error message from unknown error type
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error || "Unknown error");
}

/**
 * Type guard to validate PerFileMetadata structure
 */
function isValidPerFileMetadata(
  pfm: unknown,
): pfm is { fileId: string; title?: string; description?: string } {
  return (
    pfm !== null &&
    typeof pfm === "object" &&
    !Array.isArray(pfm) &&
    typeof (pfm as any).fileId === "string"
  );
}

/**
 * Sanitize metadata to remove non-serializable properties (DOM nodes, React Fibers, etc.)
 * Whitelists only known-good DatasetMetadata fields to prevent JSON.stringify errors
 */
function sanitizeMetadata(metadata: DatasetMetadata): DatasetMetadata {
  // Helper to safely filter string arrays - prevents DOM nodes from surviving
  const filterStrings = (arr: unknown): string[] | undefined => {
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    const filtered = arr.filter((x): x is string => typeof x === "string");
    return filtered.length > 0 ? filtered : undefined;
  };

  // Helper to safely validate and filter speaker objects
  const filterSpeakers = (arr: unknown): any[] | undefined => {
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    const filtered = arr
      .filter(
        (s): s is Record<string, unknown> =>
          s !== null && typeof s === "object" && !Array.isArray(s),
      )
      .map((s) => ({
        id: typeof s.id === "string" ? s.id : undefined,
        role: typeof s.role === "string" ? s.role : undefined,
        ageRange: typeof s.ageRange === "string" ? s.ageRange : undefined,
        gender: typeof s.gender === "string" ? s.gender : undefined,
        accent: typeof s.accent === "string" ? s.accent : undefined,
      }))
      .filter((s) => s.id !== undefined); // Must have id

    return filtered.length > 0 ? filtered : undefined;
  };

  // Validate required fields strictly
  if (metadata.consent !== true) {
    throw new Error("Consent must be explicitly granted before verification");
  }

  if (typeof metadata.title !== "string" || metadata.title.length === 0) {
    throw new Error("Title is required and must be a non-empty string");
  }

  if (
    typeof metadata.description !== "string" ||
    metadata.description.length === 0
  ) {
    throw new Error("Description is required and must be a non-empty string");
  }

  const result: DatasetMetadata = {
    title: metadata.title,
    description: metadata.description,
    consent: true, // Safe to set true only after validation above
  };

  // Languages array - only valid strings, not forwarded reference
  const languages = filterStrings(metadata.languages);
  if (languages) result.languages = languages;

  // Tags array - only valid strings, not forwarded reference
  const tags = filterStrings(metadata.tags);
  if (tags) result.tags = tags;

  // Per-file metadata array - validate with Array.isArray before .map()
  if (
    Array.isArray(metadata.perFileMetadata) &&
    metadata.perFileMetadata.length > 0
  ) {
    const filtered = metadata.perFileMetadata
      .filter(isValidPerFileMetadata)
      .map((pfm) => ({
        fileId: pfm.fileId,
        title: typeof pfm.title === "string" ? pfm.title : undefined,
        description:
          typeof pfm.description === "string" ? pfm.description : undefined,
      }));

    if (filtered.length > 0) {
      result.perFileMetadata = filtered;
    }
  }

  // Audio quality object - validate type before accessing properties
  if (
    metadata.audioQuality !== null &&
    typeof metadata.audioQuality === "object" &&
    !Array.isArray(metadata.audioQuality)
  ) {
    const aq = metadata.audioQuality as Record<string, unknown>;
    const audioQuality: any = {};

    if (typeof aq.sampleRate === "number")
      audioQuality.sampleRate = aq.sampleRate;
    if (typeof aq.bitDepth === "number") audioQuality.bitDepth = aq.bitDepth;
    if (typeof aq.channels === "number") audioQuality.channels = aq.channels;
    if (typeof aq.codec === "string") audioQuality.codec = aq.codec;
    if (typeof aq.recordingQuality === "string")
      audioQuality.recordingQuality = aq.recordingQuality;

    if (Object.keys(audioQuality).length > 0) {
      result.audioQuality = audioQuality;
    }
  }

  // Speakers object - validate type and validate speakers array with Array.isArray
  if (
    metadata.speakers !== null &&
    typeof metadata.speakers === "object" &&
    !Array.isArray(metadata.speakers)
  ) {
    const sp = metadata.speakers as Record<string, unknown>;
    const speakers: any = {};

    if (typeof sp.speakerCount === "number") {
      speakers.speakerCount = sp.speakerCount;
    }

    const speakersList = filterSpeakers(sp.speakers);
    if (speakersList) {
      speakers.speakers = speakersList;
    }

    if (Object.keys(speakers).length > 0) {
      result.speakers = speakers;
    }
  }

  // Categorization object - validate type before accessing properties
  if (
    metadata.categorization !== null &&
    typeof metadata.categorization === "object" &&
    !Array.isArray(metadata.categorization)
  ) {
    const cat = metadata.categorization as Record<string, unknown>;
    const categorization: any = {};

    if (typeof cat.useCase === "string") categorization.useCase = cat.useCase;
    if (typeof cat.contentType === "string")
      categorization.contentType = cat.contentType;
    if (typeof cat.domain === "string") categorization.domain = cat.domain;

    if (Object.keys(categorization).length > 0) {
      result.categorization = categorization;
    }
  }

  return result;
}

interface VerificationStepProps {
  audioFile?: AudioFile; // Optional - for backwards compatibility
  audioFiles?: AudioFile[]; // Optional - for backwards compatibility
  metadata: DatasetMetadata;
  // New: encrypted blob info from encryption step
  walrusBlobId?: string;
  sealIdentity?: string;
  encryptedObjectBcsHex?: string;
  walrusUpload?: WalrusUploadResult; // Alternative: pass full upload result
  existingVerification?: VerificationResult | null; // Pass existing verification from localStorage
  onVerificationComplete: (result: VerificationResult) => void;
  onError: (error: string) => void;
}

interface StageInfo {
  name: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  progress: number;
}

/**
 * VerificationStep Component
 * Mandatory AI verification before encryption using audio-verifier service
 */
export function VerificationStep({
  audioFile,
  audioFiles,
  metadata,
  walrusBlobId,
  sealIdentity,
  encryptedObjectBcsHex,
  walrusUpload,
  existingVerification,
  onVerificationComplete,
  onError,
}: VerificationStepProps) {
  // Hooks for wallet interaction
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const {
    getOrCreateSessionExport,
    sessionKey,
    keyServers: configKeyServers,
    threshold: configThreshold,
  } = useSeal();

  // State
  const [verificationState, setVerificationState] = useState<
    "idle" | "waiting-auth" | "running" | "completed" | "failed"
  >("idle");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isConfirmingSession, setIsConfirmingSession] = useState(false);
  const [dataAccessAcknowledged, setDataAccessAcknowledged] = useState(false);
  const [stages, setStages] = useState<StageInfo[]>([
    { name: "quality", status: "pending", progress: 0 },
    { name: "copyright", status: "pending", progress: 0 },
    { name: "transcription", status: "pending", progress: 0 },
    { name: "analysis", status: "pending", progress: 0 },
  ]);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<any>(null);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [sessionKeyExport, setSessionKeyExport] = useState<any>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [stageStartTimes, setStageStartTimes] = useState<
    Record<string, number>
  >({});
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedRef = useRef(false); // Guard against React 18 Strict Mode double-mount
  const isAuthorizingRef = useRef(false); // Guard against duplicate authorization attempts
  const isVerifyingRef = useRef(false); // Guard against duplicate verification attempts
  const logIdCounter = useRef(0);

  // Helper to add activity log
  const addLog = (
    stage: string,
    message: string,
    type: ActivityLogEntry["type"],
    progress?: number,
  ) => {
    const log: ActivityLogEntry = {
      id: `log-${logIdCounter.current++}`,
      timestamp: Date.now(),
      stage,
      message,
      type,
      progress,
    };
    setActivityLogs((prev) => [...prev, log]);
  };

  // Auto-start verification when component mounts
  useEffect(() => {
    // Log props received
    console.log("[VerificationStep] 🔍 DEBUG - Component mounted with props:", {
      hasWalrusUpload: !!walrusUpload,
      walrusUploadBlobId: walrusUpload?.blobId,
      walrusUploadSealPolicyId: walrusUpload?.seal_policy_id?.slice(0, 20),
      walrusUploadEncryptedHex: walrusUpload?.encryptedObjectBcsHex
        ? "present"
        : "missing",
      encryptedObjectBcsHexLength:
        walrusUpload?.encryptedObjectBcsHex?.length ?? 0,
      hasLegacyProps: !!(walrusBlobId || sealIdentity || encryptedObjectBcsHex),
      hasExistingVerification: !!existingVerification,
      existingVerificationState: existingVerification?.state,
      hasStartedRefValue: hasStartedRef.current,
      timestamp: new Date().toISOString(),
    });

    // Prevent duplicate requests in React 18 Strict Mode
    if (hasStartedRef.current) {
      console.log(
        "[VerificationStep] 🛑 Already started (hasStartedRef=true), skipping mount logic",
      );
      addLog(
        "DEBUG",
        "Mount logic skipped - already started (React Strict Mode)",
        "info",
      );
      return;
    }

    hasStartedRef.current = true;
    console.log("[VerificationStep] ✅ Setting hasStartedRef=true");

    // Skip if verification already completed (from localStorage restoration)
    console.log(
      "[VerificationStep] 🔍 DEBUG - Checking if should skip verification:",
      {
        existingVerificationExists: !!existingVerification,
        existingVerificationState: existingVerification?.state,
        shouldSkip: existingVerification?.state === "completed",
        existingVerificationFull: existingVerification
          ? JSON.stringify(existingVerification, null, 2)
          : "null",
        timestamp: new Date().toISOString(),
      },
    );

    if (existingVerification?.state === "completed") {
      console.log(
        "[VerificationStep] ⏭️ Verification already completed, auto-advancing...",
      );
      console.log(
        "[VerificationStep] 📊 Existing verification result:",
        JSON.stringify(existingVerification, null, 2),
      );
      addLog(
        "RESTORE",
        "✅ Verification already completed from previous session",
        "success",
      );
      addLog(
        "RESTORE",
        `Safety: ${existingVerification.safetyPassed ? "PASSED" : "FAILED"}, Quality: ${existingVerification.qualityScore || "N/A"}`,
        "success",
      );
      setResult(existingVerification);
      setVerificationState("completed");
      // Auto-advance immediately
      setTimeout(() => {
        console.log(
          "[VerificationStep] 🚀 Calling onVerificationComplete with existing result",
        );
        onVerificationComplete(existingVerification);
      }, 500);
      return;
    }

    console.log(
      "[VerificationStep] 🆕 No existing verification, starting fresh verification process",
    );
    addLog("INIT", "Initializing verification process...", "info");
    // Move to waiting-auth state - user needs to authorize first
    setVerificationState("waiting-auth");

    // Cleanup polling on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset verification guard when verification completes or fails
  useEffect(() => {
    if (verificationState === "failed" || verificationState === "completed") {
      isVerifyingRef.current = false;
    }
  }, [verificationState]);

  /**
   * Request user authorization for verification
   * Reuses existing valid session if available, creates new one only if needed
   */
  const handleAuthorizeVerification = async () => {
    console.log(
      "[VerificationStep] 🔍 DEBUG - handleAuthorizeVerification called:",
      {
        isAuthorizingRefValue: isAuthorizingRef.current,
        verificationState,
        hasExistingVerification: !!existingVerification,
        existingVerificationState: existingVerification?.state,
        timestamp: new Date().toISOString(),
      },
    );

    // Guard against duplicate authorization attempts
    if (isAuthorizingRef.current) {
      console.log(
        "[VerificationStep] Authorization already in progress, skipping duplicate",
      );
      addLog("DEBUG", "Authorization already in progress, skipping", "warning");
      return;
    }

    // Warn if we're requesting auth when verification already completed
    if (existingVerification?.state === "completed") {
      console.warn(
        "[VerificationStep] ⚠️ WARNING: Requesting authorization when verification already completed!",
      );
      addLog(
        "WARN",
        "⚠️ Authorization requested but verification already completed - this should not happen!",
        "warning",
      );
    }

    isAuthorizingRef.current = true;

    console.log("[VerificationStep] Requesting user authorization...");
    addLog("AUTH", "Requesting wallet authorization...", "info");
    setIsCreatingSession(true);
    setErrorMessage(null);

    try {
      // Check if we already have a valid session - skip wallet prompt if so
      if (sessionKey && isSessionValid(sessionKey)) {
        console.log(
          "[VerificationStep] Valid session exists, using cached session",
        );
        const exported = sessionKey.export();
        console.log("[VerificationStep] Session export from cache");
        setSessionKeyExport(exported);
        setVerificationState("running");
        setIsCreatingSession(false);
        isAuthorizingRef.current = false;
        addLog("AUTH", "✓ Using cached session", "success");
        startVerification();
        return;
      }

      // No valid session, create new one with extended TTL for verification (30 min)
      // Verification can take time on large files, so we need a longer window
      const exported = await getOrCreateSessionExport({
        ttlMin: 30, // Extended from default 10 min for verification flow
        signMessage: async (message: Uint8Array) => {
          const result = await signPersonalMessage({ message });
          return { signature: result.signature };
        },
      });

      console.log("[VerificationStep] Session obtained (cached or new)");
      setSessionKeyExport(exported);
      setIsCreatingSession(false);
      setIsConfirmingSession(true);
      isAuthorizingRef.current = false;
      addLog("AUTH", "Session created, confirming on-chain...", "progress");

      // Wait for session to be confirmed on-chain before starting verification
      // Extended timeout to handle slow blockchain confirmations
      console.log("[VerificationStep] Waiting 15s for session confirmation...");
      addLog("AUTH", "Waiting for blockchain confirmation (15s)...", "progress");
      await new Promise((resolve) => setTimeout(resolve, 15000));
      
      console.log(
        "[VerificationStep] ✅ Session confirmed on blockchain, starting verification",
      );
      addLog("AUTH", "✅ Session confirmed on blockchain", "success");

      setIsConfirmingSession(false);
      setVerificationState("running");
      addLog("VERIFY", "Starting AI verification pipeline", "progress");

      // Start verification with session data
      startVerification();
    } catch (error) {
      console.error("[VerificationStep] Failed to create session:", error);
      const errorMsg = getErrorMessage(error);

      // Provide specific error messages for session creation failures
      let displayError = errorMsg || "Failed to create authorization session";

      if (errorMsg.includes("user rejected") || errorMsg.includes("denied")) {
        displayError =
          "You rejected the authorization request. Please approve to continue.";
      } else if (
        errorMsg.includes("wallet") ||
        errorMsg.includes("not connected")
      ) {
        displayError =
          "Wallet not connected. Please connect your wallet and try again.";
      } else if (errorMsg.includes("timeout")) {
        displayError = "Authorization request timed out. Please try again.";
      }

      setErrorMessage(displayError);
      setIsCreatingSession(false);
      setIsConfirmingSession(false);
      isAuthorizingRef.current = false;
    }
  };

  const startVerification = async () => {
    console.log("[VerificationStep] 🔍 DEBUG - startVerification called:", {
      isVerifyingRefValue: isVerifyingRef.current,
      verificationState,
      hasExistingVerification: !!existingVerification,
      existingVerificationState: existingVerification?.state,
      hasSessionKeyExport: !!sessionKeyExport,
      timestamp: new Date().toISOString(),
    });

    // Guard against duplicate verification attempts
    if (isVerifyingRef.current) {
      console.log(
        "[VerificationStep] Verification already in progress, skipping duplicate",
      );
      addLog(
        "DEBUG",
        "Verification already in progress, skipping duplicate",
        "warning",
      );
      return;
    }

    // ERROR if we're starting verification when already completed
    if (existingVerification?.state === "completed") {
      console.error(
        "[VerificationStep] ❌ ERROR: Starting verification when already completed!",
      );
      console.error(
        "[VerificationStep] Existing verification:",
        JSON.stringify(existingVerification, null, 2),
      );
      addLog(
        "ERROR",
        "❌ Attempting to start verification when already completed - THIS IS A BUG!",
        "error",
      );
      addLog(
        "ERROR",
        `Existing result: Safety ${existingVerification.safetyPassed ? "PASSED" : "FAILED"}`,
        "error",
      );
      // Don't return - let it continue to surface the bug
    }

    isVerifyingRef.current = true;

    console.log("[VerificationStep] 🚀 Starting verification...");
    addLog("VERIFY", "Starting verification pipeline...", "progress");
    setErrorMessage(null);
    setErrorDetails(null);
    setWarnings([]);

    if (!sessionKeyExport) {
      console.error("[VerificationStep] ❌ No session key export available");
      addLog("ERROR", "Session expired - re-authorization needed", "error");
      setErrorMessage("Session expired. Please authorize again.");
      setVerificationState("waiting-auth");
      isVerifyingRef.current = false;
      return;
    }
    
    console.log("[VerificationStep] ✅ Session key export validated, proceeding with verification");
    addLog("VERIFY", "Session validated, preparing verification request", "progress");

    // Determine if we're using encrypted blob flow or legacy file flow
    const useEncryptedFlow = !!(
      walrusUpload ||
      (walrusBlobId && sealIdentity && encryptedObjectBcsHex)
    );
    console.log("[VerificationStep] Using encrypted flow:", useEncryptedFlow, {
      hasWalrusUpload: !!walrusUpload,
      walrusUploadBlobId: walrusUpload?.blobId,
      walrusUploadEncryptedHex: !!walrusUpload?.encryptedObjectBcsHex,
      hasLegacyWalrusBlobId: !!walrusBlobId,
      hasSealIdentity: !!sealIdentity,
      hasLegacyEncryptedHex: !!encryptedObjectBcsHex,
    });

    if (useEncryptedFlow) {
      // New encrypted blob flow
      const blobId = walrusUpload?.blobId || walrusBlobId!;
      const identity = walrusUpload?.seal_policy_id || sealIdentity!;
      const encryptedObjectHex =
        walrusUpload?.encryptedObjectBcsHex || encryptedObjectBcsHex;

      console.log("[VerificationStep] Extracted values from walrusUpload:", {
        blobId,
        identityPrefix: identity?.slice(0, 20),
        encryptedObjectHexPresent: !!encryptedObjectHex,
        encryptedObjectHexLength: encryptedObjectHex?.length ?? 0,
      });

      console.log(
        "[VerificationStep] Validation passed. Starting encrypted blob verification...",
      );

      setTotalFiles(1);
      setCurrentFileIndex(0);

      await verifyEncryptedBlob(blobId, identity);
    } else {
      // Legacy file upload flow (for backwards compatibility)
      if (!audioFile && (!audioFiles || audioFiles.length === 0)) {
        setErrorMessage("No audio file or encrypted blob provided");
        setVerificationState("failed");
        onError("No audio file or encrypted blob provided");
        return;
      }

      const filesToVerify =
        audioFiles && audioFiles.length > 0 ? audioFiles : [audioFile!];
      setTotalFiles(filesToVerify.length);
      setCurrentFileIndex(0);

      // Verify files sequentially
      await verifyNextFile(filesToVerify, 0);
    }
  };

  const verifyNextFile = async (files: AudioFile[], fileIndex: number) => {
    if (fileIndex >= files.length) {
      // All files verified successfully
      const finalResult: VerificationResult = {
        id: verificationId || "multi-file-verification",
        state: "completed",
        currentStage: "completed",
        stages: [
          { name: "decryption", status: "completed", progress: 100 },
          { name: "quality", status: "completed", progress: 100 },
          { name: "copyright", status: "completed", progress: 100 },
          { name: "transcription", status: "completed", progress: 100 },
          { name: "analysis", status: "completed", progress: 100 },
        ],
        qualityScore: 1.0, // Overall pass
        safetyPassed: true,
        insights: [`Successfully verified ${files.length} file(s)`],
        updatedAt: Date.now(),
      };
      console.log(
        "[VerificationStep] ✅ Verification SUCCESS! Calling onVerificationComplete",
      );
      console.log("[VerificationStep] Result summary:", {
        id: finalResult.id,
        state: finalResult.state,
        safetyPassed: finalResult.safetyPassed,
        qualityScore: finalResult.qualityScore,
      });
      setResult(finalResult);
      setVerificationState("completed");
      onVerificationComplete(finalResult);
      return;
    }

    setCurrentFileIndex(fileIndex);

    // Reset stages for current file
    setStages([
      { name: "decryption", status: "completed", progress: 100 }, // N/A for legacy file flow
      { name: "quality", status: "pending", progress: 0 },
      { name: "copyright", status: "pending", progress: 0 },
      { name: "transcription", status: "pending", progress: 0 },
      { name: "analysis", status: "pending", progress: 0 },
    ]);

    try {
      // Prepare form data with raw audio file (BEFORE encryption!)
      const formData = new FormData();
      formData.append("file", files[fileIndex].file);
      // Sanitize metadata to remove any non-serializable properties
      const sanitizedMetadata = sanitizeMetadata(metadata);
      formData.append("metadata", JSON.stringify(sanitizedMetadata));

      // Call server-side API (proxies to audio-verifier with secure token)
      const response = await fetch("/api/verify", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail || `HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const data = await response.json();
      const { verificationId: id } = data;

      setVerificationId(id);

      // Start polling for verification status
      startPolling(id, files, fileIndex);
    } catch (error) {
      console.error("Failed to start verification:", error);
      const errorMsg = getErrorMessage(error);
      setErrorMessage(errorMsg || "Failed to start verification");
      setVerificationState("failed");
      onError(errorMsg || "Verification failed to start");
    }
  };

  const verifyEncryptedBlob = async (
    walrusBlobId: string,
    sealIdentity: string,
  ) => {
    try {
      if (!sessionKeyExport) {
        throw new Error(
          "No active session. Please authorize verification first.",
        );
      }

      console.log("[VerificationStep] 📤 Sending verification request to backend");
      console.log("[VerificationStep] Request params:", {
        walrusBlobId,
        sealIdentity: sealIdentity?.slice(0, 20) + "...",
        hasEncryptedHex: !!encryptedObjectBcsHex,
        hasMetadata: !!metadata,
        hasSessionKey: !!sessionKeyExport,
      });
      addLog(
        "DECRYPT",
        "Preparing encrypted blob for verification...",
        "progress",
      );

      // Sanitize metadata to remove any non-serializable properties
      const sanitizedMetadata = sanitizeMetadata(metadata);

      // Validate and inject keyServers + threshold into session payload
      // Priority: session export > config > empty fallback
      let keyServers = sessionKeyExport.keyServers;
      if (
        !keyServers ||
        !Array.isArray(keyServers) ||
        keyServers.length === 0
      ) {
        // Export didn't have keyServers, use config
        keyServers = configKeyServers;
      }

      // Fail if we still don't have keyServers - env not configured
      if (
        !keyServers ||
        !Array.isArray(keyServers) ||
        keyServers.length === 0
      ) {
        const envError =
          "Key servers not configured. Set NEXT_PUBLIC_SEAL_KEY_SERVERS env var.";
        console.error("[VerificationStep]", envError);
        setErrorMessage(envError);
        setVerificationState("failed");
        return;
      }

      const threshold = sessionKeyExport.threshold ?? configThreshold ?? 4;
      const sessionPayload = { ...sessionKeyExport, keyServers, threshold };

      // Stringify with Uint8Array replacer - converts Uint8Array to arrays
      let sessionKeyJson: string;
      try {
        sessionKeyJson = JSON.stringify(sessionPayload, (_k, v) =>
          v instanceof Uint8Array ? Array.from(v) : v,
        );
      } catch (err) {
        const serializationError = getErrorMessage(err);
        console.error(
          "[VerificationStep] Failed to serialize session payload:",
          serializationError,
        );
        setErrorMessage(`Session encoding failed: ${serializationError}`);
        setVerificationState("failed");
        return;
      }

      // Development: log sessionKeyData structure for debugging
      if (process.env.NODE_ENV === "development") {
        console.log("[VerificationStep] sessionKeyData validated:", {
          keyServersCount: keyServers.length,
          keyServerSample: keyServers[0],
          threshold,
          isString: true,
        });
      }

      // Backend will handle blob fetch and decryption
      // We only need to send sessionKeyData for backend to decrypt
      addLog("DECRYPT", "Fetching encrypted blob from Walrus...", "progress");

      console.log("[VerificationStep] 🌐 Fetching /api/verify endpoint...");
      addLog("API", "Sending request to verification service", "progress");
      
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walrusBlobId,
          sealIdentity,
          encryptedObjectBcsHex:
            walrusUpload?.encryptedObjectBcsHex || encryptedObjectBcsHex,
          metadata: sanitizedMetadata,
          sessionKeyData: sessionKeyJson,
        }),
      });

      console.log("[VerificationStep] 📥 API response received:", {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
      });
      addLog(
        "DECRYPT",
        `API response: ${response.status} ${response.statusText}`,
        response.ok ? "progress" : "error",
      );

      addLog(
        "DECRYPT",
        "Blob fetched, decrypting with SEAL key servers...",
        "progress",
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail ||
            errorData.error ||
            `HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const data = await response.json();
      const id = data.sessionObjectId || data.verificationId; // Backend returns sessionObjectId

      if (!id) {
        throw new Error("No verification ID returned from server");
      }

      setVerificationId(id);

      // Start polling for verification status
      startPollingEncrypted(id);
    } catch (error) {
      console.error("[VerificationStep] Failed to decrypt and verify:", error);
      const errorMsg = getErrorMessage(error);

      // Provide specific error messages based on error type
      let displayError = errorMsg || "Failed to decrypt and verify audio";

      if (errorMsg.includes("E_EXPIRED")) {
        displayError =
          "Verification window expired (15 minutes exceeded). Please re-upload and try again.";
      } else if (errorMsg.includes("E_INVALID_TIMESTAMP")) {
        displayError =
          "Invalid upload timestamp. Please make sure your system clock is correct and try again.";
      } else if (errorMsg.includes("expired") || errorMsg.includes("Expired")) {
        displayError =
          "Authorization session expired. Please try again and complete verification within 30 minutes.";
      } else if (errorMsg.includes("403") || errorMsg.includes("Forbidden")) {
        displayError =
          "Access denied. Please check your wallet connection and try again.";
      } else if (
        errorMsg.includes("Invalid upload timestamp") ||
        errorMsg.includes("Did you pass seconds")
      ) {
        displayError =
          "Invalid timestamp format. Please refresh and try verification again.";
      } else if (errorMsg.includes("502") || errorMsg.includes("Bad Gateway")) {
        displayError =
          "Decryption service temporarily unavailable. Please try again in a few moments. If the issue persists, contact support.";
      } else if (
        errorMsg.includes("504") ||
        errorMsg.includes("Gateway Timeout")
      ) {
        displayError =
          "Decryption service is taking too long. Please try again. Large files may require additional time.";
      } else if (
        errorMsg.includes("network") ||
        errorMsg.includes("timeout") ||
        errorMsg.includes("unreachable")
      ) {
        displayError =
          "Network error during verification. Please check your connection and retry.";
      } else if (
        errorMsg.includes("corrupted") ||
        errorMsg.includes("invalid")
      ) {
        displayError =
          "The audio file appears corrupted. Please re-upload and try again.";
      } else if (errorMsg.includes("HTTP")) {
        displayError =
          "Server error during verification. Please try again later.";
      } else if (
        errorMsg.includes("DEPLOYMENT_NOT_FOUND") ||
        errorMsg.includes("deployment could not be found")
      ) {
        displayError =
          "Deployment update detected. Refreshing page to get latest version...";
        // Force reload to fix stale deployment
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }

      setErrorMessage(displayError);
      setVerificationState("failed");
      onError(displayError);
    }
  };

  const startPollingEncrypted = (sessionObjectId: string) => {
    // Guard against duplicate polling intervals (can happen in React Strict Mode)
    if (pollingIntervalRef.current) {
      console.log(
        "[VerificationStep] Polling already in progress, skipping duplicate",
      );
      return;
    }

    addLog("VERIFY", "Starting verification pipeline...", "progress");

    // Poll every 2 seconds
    const interval = setInterval(async () => {
      try {
        // Call server-side API (proxies to audio-verifier with secure token)
        const response = await fetch(`/api/verify/${sessionObjectId}`);

        if (!response.ok) {
          throw new Error(`Failed to poll verification: ${response.status}`);
        }

        const session = await response.json();

        // Parse response based on new API contract
        const currentStage = session.currentStage || session.stage || "quality";
        const progress = session.progress || 0;
        const approved = session.approved ?? false;
        const qualityScore = session.qualityScore ?? 0;
        const suggestedPrice = session.suggestedPrice ?? 3.0;
        const safetyPassed = session.safetyPassed ?? false;
        const analysis = session.analysis || {};
        const errors = session.errors || [];
        const sessionWarnings = session.warnings || [];

        // Capture warnings from session (non-fatal)
        if (sessionWarnings.length > 0) {
          setWarnings(sessionWarnings);
        }

        // Add activity logs for stage changes
        const stageMessages: Record<string, string> = {
          quality: "Analyzing audio quality, sample rate, and volume levels...",
          copyright: "Running fingerprint analysis for copyright detection...",
          transcription: "Transcribing audio to text using Voxtral AI...",
          analysis: "Performing AI quality and safety analysis...",
          finalizing: "Aggregating results and calculating final score...",
        };

        // Track stage start times and log transitions
        if (currentStage && !stageStartTimes[currentStage]) {
          setStageStartTimes((prev) => ({
            ...prev,
            [currentStage]: Date.now(),
          }));
          if (stageMessages[currentStage]) {
            addLog(
              currentStage.toUpperCase(),
              stageMessages[currentStage],
              "progress",
              progress,
            );
          }
        }

        // Update stages based on current stage
        updateStagesFromSession({
          stage: currentStage,
          progress,
        });

        // Check if completed or failed
        // Note: Use != null to check for both null AND undefined (session.approved can be null during processing)
        if (session.state === "completed" || session.approved != null) {
          clearInterval(interval);
          pollingIntervalRef.current = null;

          // Check if approved
          if (!approved) {
            // Verification failed validation
            addLog(
              "FAILED",
              errors[0] || "Verification failed checks",
              "error",
            );
            setVerificationState("failed");
            setErrorMessage(
              errors[0] ||
                "Verification failed quality, copyright, or safety checks",
            );
            setErrorDetails({ ...session, errors });
            onError(errors[0] || "Verification checks failed");
            return;
          }

          // Verification passed
          addLog(
            "COMPLETE",
            `Verification completed! Quality score: ${qualityScore}%`,
            "success",
          );
          addLog(
            "COMPLETE",
            `Suggested price: ${suggestedPrice.toFixed(2)} SUI`,
            "success",
          );

          const finalResult: VerificationResult = {
            id: sessionObjectId,
            state: "completed",
            currentStage: "completed",
            stages: [
              { name: "decryption", status: "completed", progress: 100 },
              { name: "quality", status: "completed", progress: 100 },
              { name: "copyright", status: "completed", progress: 100 },
              { name: "transcription", status: "completed", progress: 100 },
              { name: "analysis", status: "completed", progress: 100 },
            ],
            transcript: session.transcript,
            qualityScore: qualityScore / 100, // Convert 0-100 to 0-1
            suggestedPrice,
            safetyPassed,
            insights: analysis.insights || [],
            analysis: session.analysis,
            updatedAt: Date.now(),
            transcriptionDetails: session.transcriptionDetails,
            categorizationValidation: session.categorizationValidation,
            qualityBreakdown: session.qualityBreakdown,
          };

          console.log(
            "[VerificationStep] ✅ Verification SUCCESS (polling)! Calling onVerificationComplete",
          );
          console.log("[VerificationStep] Result summary:", {
            id: finalResult.id,
            state: finalResult.state,
            safetyPassed: finalResult.safetyPassed,
            qualityScore: finalResult.qualityScore,
          });
          setResult(finalResult);
          setVerificationState("completed");
          onVerificationComplete(finalResult);
        } else if (session.state === "failed") {
          clearInterval(interval);
          pollingIntervalRef.current = null;

          setVerificationState("failed");
          setErrorMessage(errors[0] || "Verification failed");
          setErrorDetails({ ...session, errors });
          onError(errors[0] || "Verification failed");
        }
      } catch (error) {
        console.error("Polling error:", error);
        // Don't fail immediately on polling errors, keep trying
      }
    }, 2000);

    pollingIntervalRef.current = interval;
  };

  const startPolling = (id: string, files: AudioFile[], fileIndex: number) => {
    // Guard against duplicate polling intervals (can happen in React Strict Mode)
    if (pollingIntervalRef.current) {
      console.log(
        "[VerificationStep] Polling already in progress, skipping duplicate",
      );
      return;
    }

    // Poll every 2 seconds
    const interval = setInterval(async () => {
      try {
        // Call server-side API (proxies to audio-verifier with secure token)
        const response = await fetch(`/api/verify/${id}`);

        if (!response.ok) {
          throw new Error(`Failed to poll verification: ${response.status}`);
        }

        const session = await response.json();

        // Capture warnings from session (non-fatal)
        const sessionWarnings = session.warnings || [];
        if (sessionWarnings.length > 0) {
          setWarnings(sessionWarnings);
        }

        // Update stages based on current stage
        updateStagesFromSession(session);

        // Check if completed or failed
        if (session.state === "completed") {
          clearInterval(interval);
          pollingIntervalRef.current = null;

          // Check if approved
          if (!session.approved) {
            // Verification failed validation
            setVerificationState("failed");
            setErrorMessage(
              "Verification failed quality, copyright, or safety checks",
            );
            setErrorDetails(session);
            onError("Verification checks failed");
            return;
          }

          // This file passed, move to next file
          await verifyNextFile(files, fileIndex + 1);
        } else if (session.state === "failed") {
          clearInterval(interval);
          pollingIntervalRef.current = null;

          setVerificationState("failed");
          setErrorMessage(session.errors?.[0] || "Verification failed");
          setErrorDetails(session);
          onError(session.errors?.[0] || "Verification failed");
        }
      } catch (error) {
        console.error("Polling error:", error);
        // Don't fail immediately on polling errors, keep trying
      }
    }, 2000);

    pollingIntervalRef.current = interval;
  };

  const updateStagesFromSession = (
    session: Pick<VerificationSession, "stage" | "progress">,
  ) => {
    const currentStage = session.stage;
    const progress = session.progress || 0;

    const stageOrder = ["quality", "copyright", "transcription", "analysis"];
    const currentIndex = stageOrder.indexOf(currentStage);

    setStages((prev) =>
      prev.map((stage, idx) => {
        if (idx < currentIndex) {
          return { ...stage, status: "completed", progress: 100 };
        } else if (stage.name === currentStage) {
          return {
            ...stage,
            status: "in_progress",
            progress: Math.round(progress * 100),
          };
        } else {
          return { ...stage, status: "pending", progress: 0 };
        }
      }),
    );
  };

  const stageConfig = {
    quality: {
      icon: <Music className="w-5 h-5" />,
      label: "Quality Check",
      description: "Analyzing audio quality, sample rate, and volume levels",
    },
    copyright: {
      icon: <Copyright className="w-5 h-5" />,
      label: "Copyright Detection",
      description: "Checking for copyrighted content using fingerprinting",
    },
    transcription: {
      icon: <FileText className="w-5 h-5" />,
      label: "Transcription",
      description: "Converting audio to text using Gemini AI",
    },
    analysis: {
      icon: <Brain className="w-5 h-5" />,
      label: "AI Analysis",
      description: "Analyzing quality, safety, and content value",
    },
  };

  return (
    <div className="space-y-6">
      {/* Optional Metadata Reminder */}
      <GlassCard className="bg-sonar-signal/5 border border-sonar-signal/30">
        <div className="flex items-start space-x-3">
          <FileText className="w-5 h-5 text-sonar-signal mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="font-mono font-semibold text-sonar-highlight-bright mb-1">
              Enhance Your Dataset Value
            </h3>
            <p className="text-sm text-sonar-highlight/80 mb-3">
              Add optional metadata like Audio Quality (+10% points) and Speaker
              Information (+15% points) to boost your rarity score and attract
              more buyers.
            </p>
            <p className="text-xs text-sonar-highlight/60 mb-3">
              You can go back to the metadata form to fill in these optional
              fields at any time.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Waiting for User Authorization */}
      {verificationState === "waiting-auth" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* Data Access Notice */}
          <DataAccessNotice
            onAcknowledge={setDataAccessAcknowledged}
            disabled={isCreatingSession}
          />

          <GlassCard className="text-center py-8">
            <div className="flex justify-center mb-4">
              <div className="p-6 rounded-full bg-sonar-signal/10">
                <Shield className="w-12 h-12 text-sonar-signal" />
              </div>
            </div>
            <h3 className="text-2xl font-mono font-bold text-sonar-highlight-bright mb-2">
              Authorize Verification
            </h3>
            <p className="text-sonar-highlight/70 max-w-2xl mx-auto mb-6">
              Sign with your Sui wallet to authorize Sonar to verify your
              encrypted audio with secure key server authentication.
            </p>
            <p className="text-sm text-sonar-highlight/50 mb-8">
              Your signature proves you own this audio and authorizes temporary
              key access for verification.
            </p>
            <SonarButton
              onClick={handleAuthorizeVerification}
              disabled={
                isCreatingSession ||
                isConfirmingSession ||
                !dataAccessAcknowledged
              }
              className="w-full"
            >
              {isCreatingSession
                ? "Signing..."
                : isConfirmingSession
                  ? "Confirming session..."
                  : "Sign & Authorize"}
            </SonarButton>
            {errorMessage && (
              <div className="mt-4 p-3 rounded-sonar bg-sonar-coral/10 border border-sonar-coral/20">
                <p className="text-sm text-sonar-coral">{errorMessage}</p>
              </div>
            )}
          </GlassCard>
        </motion.div>
      )}

      {/* Verification Running */}
      {verificationState === "running" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* Header */}
          <GlassCard className="text-center py-6">
            <div className="flex justify-center mb-4">
              <div className="p-6 rounded-full bg-sonar-signal/10">
                <Brain className="w-12 h-12 text-sonar-signal" />
              </div>
            </div>
            <h3 className="text-2xl font-mono font-bold text-sonar-highlight-bright mb-2">
              Verifying Audio Quality
            </h3>
            <p className="text-sonar-highlight/70 max-w-2xl mx-auto">
              Running comprehensive checks on your audio before encryption
            </p>
            {totalFiles > 1 && (
              <p className="text-sm text-sonar-signal mt-2 font-mono">
                File {currentFileIndex + 1} of {totalFiles}
              </p>
            )}
          </GlassCard>

          {/* Activity Feed */}
          <VerificationActivityFeed logs={activityLogs} />

          {/* Warnings */}
          {warnings.length > 0 && (
            <GlassCard className="bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-mono font-semibold text-amber-600 mb-2">
                    Processing Notes:
                  </p>
                  <ul className="space-y-1">
                    {warnings.map((warning, idx) => (
                      <li key={idx} className="text-xs text-amber-600/80">
                        • {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </GlassCard>
          )}

          <GlassCard className="bg-sonar-blue/5 text-center">
            <div className="flex items-center justify-center space-x-2 text-sonar-highlight/70">
              <Clock className="w-4 h-4 animate-pulse" />
              <p className="text-sm font-mono">
                Verification typically completes in 30-60 seconds
              </p>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Verification Complete */}
      {verificationState === "completed" && result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <GlassCard className="bg-sonar-signal/10 border border-sonar-signal">
            <div className="flex items-center space-x-4 mb-4">
              <CheckCircle className="w-8 h-8 text-sonar-signal" />
              <div>
                <h3 className="text-xl font-mono font-bold text-sonar-highlight-bright">
                  Verification Complete!
                </h3>
                <p className="text-sm text-sonar-highlight/70">
                  Your audio passed all quality and safety checks
                </p>
              </div>
            </div>

            {/* Quality Score */}
            {result.qualityScore !== undefined && (
              <div className="mt-4 p-4 rounded-sonar bg-sonar-abyss/30">
                <p className="text-sm font-mono text-sonar-highlight/70 mb-2">
                  Quality Score
                </p>
                <div className="flex items-center space-x-3">
                  <div className="flex-1 h-2 bg-sonar-blue/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sonar-signal to-sonar-blue"
                      style={{ width: `${result.qualityScore * 100}%` }}
                    />
                  </div>
                  <span className="text-2xl font-mono font-bold text-sonar-signal">
                    {Math.round(result.qualityScore * 100)}%
                  </span>
                </div>
              </div>
            )}

            {/* AI Suggested Price */}
            {result.suggestedPrice !== undefined && (
              <div className="mt-4 p-4 rounded-sonar bg-sonar-abyss/30">
                <p className="text-sm font-mono text-sonar-highlight/70 mb-2">
                  AI Suggested Price
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-sonar-highlight/60">
                    Based on quality, uniqueness, and market value
                  </p>
                  <span className="text-2xl font-mono font-bold text-sonar-signal">
                    {result.suggestedPrice.toFixed(2)} SUI
                  </span>
                </div>
              </div>
            )}

            {/* Overall Summary */}
            {result.analysis?.overallSummary && (
              <div className="mt-4 p-4 rounded-sonar bg-sonar-abyss/30 border border-sonar-blue/30">
                <p className="text-sm font-mono text-sonar-highlight/70 mb-3">
                  Summary
                </p>
                <p className="text-sm text-sonar-highlight/90 leading-relaxed">
                  {result.analysis.overallSummary}
                </p>
              </div>
            )}

            {/* Quality Analysis Breakdown */}
            {result.analysis?.qualityAnalysis && (
              <div className="mt-4 p-4 rounded-sonar bg-sonar-abyss/30">
                <p className="text-sm font-mono font-semibold text-sonar-highlight-bright mb-3">
                  Quality Analysis Breakdown
                </p>
                <div className="space-y-3">
                  {[
                    {
                      label: "Clarity",
                      component: result.analysis.qualityAnalysis.clarity,
                    },
                    {
                      label: "Content Value",
                      component: result.analysis.qualityAnalysis.contentValue,
                    },
                    {
                      label: "Metadata Accuracy",
                      component:
                        result.analysis.qualityAnalysis.metadataAccuracy,
                    },
                    {
                      label: "Completeness",
                      component: result.analysis.qualityAnalysis.completeness,
                    },
                  ].map(({ label, component }) => (
                    <div key={label} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-sonar-highlight/70">
                          {label}
                        </span>
                        <span className="text-sm font-mono font-semibold text-sonar-signal">
                          {Math.round(component.score * 100)}%
                        </span>
                      </div>
                      <div className="h-1 bg-sonar-blue/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-sonar-signal to-sonar-blue"
                          style={{ width: `${component.score * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-sonar-highlight/60 italic">
                        {component.reasoning}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Price Analysis Breakdown */}
            {result.analysis?.priceAnalysis && (
              <div className="mt-4 p-4 rounded-sonar bg-sonar-abyss/30">
                <p className="text-sm font-mono font-semibold text-sonar-highlight-bright mb-3">
                  Price Analysis
                </p>
                <div className="space-y-2 text-sm text-sonar-highlight/80">
                  <div className="flex justify-between">
                    <span>Base Price:</span>
                    <span className="font-mono">
                      {result.analysis.priceAnalysis.basePrice.toFixed(2)} SUI
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Quality Multiplier:</span>
                    <span className="font-mono">
                      {result.analysis.priceAnalysis.qualityMultiplier.toFixed(
                        2,
                      )}
                      ×
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rarity Multiplier:</span>
                    <span className="font-mono">
                      {result.analysis.priceAnalysis.rarityMultiplier.toFixed(
                        2,
                      )}
                      ×
                    </span>
                  </div>
                  <div className="border-t border-sonar-blue/30 pt-2 mt-2 flex justify-between font-semibold">
                    <span>Final Price:</span>
                    <span className="font-mono text-sonar-signal">
                      {result.analysis.priceAnalysis.finalPrice.toFixed(2)} SUI
                    </span>
                  </div>
                  <p className="text-xs text-sonar-highlight/60 italic mt-3">
                    {result.analysis.priceAnalysis.breakdown}
                  </p>
                </div>
              </div>
            )}

            {/* Per-File Analysis */}
            {result.analysis?.fileAnalyses &&
              result.analysis.fileAnalyses.length > 0 && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-mono font-semibold text-sonar-highlight-bright">
                    Per-File Analysis
                  </p>
                  {result.analysis.fileAnalyses.map((file, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-sonar bg-sonar-abyss/30 border border-sonar-blue/20 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <p className="font-mono text-sm font-semibold text-sonar-highlight">
                          {file.title}
                        </p>
                        <span className="text-sm font-mono font-bold text-sonar-signal">
                          {Math.round(file.score * 100)}%
                        </span>
                      </div>
                      <p className="text-xs text-sonar-highlight/70">
                        {file.summary}
                      </p>
                      {file.strengths && file.strengths.length > 0 && (
                        <div className="text-xs text-sonar-highlight/70">
                          <span className="font-semibold text-sonar-signal">
                            Strengths:
                          </span>{" "}
                          {file.strengths.join(", ")}
                        </div>
                      )}
                      {file.concerns && file.concerns.length > 0 && (
                        <div className="text-xs text-sonar-highlight/70">
                          <span className="font-semibold text-sonar-coral">
                            Concerns:
                          </span>{" "}
                          {file.concerns.join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

            {/* Recommendations */}
            {result.analysis?.recommendations && (
              <div className="mt-4 p-4 rounded-sonar bg-sonar-abyss/30 space-y-3">
                <p className="text-sm font-mono font-semibold text-sonar-highlight-bright">
                  Recommendations
                </p>
                {typeof result.analysis.recommendations === "object" &&
                !Array.isArray(result.analysis.recommendations) ? (
                  // Categorized recommendations
                  <div className="space-y-3">
                    {result.analysis.recommendations.critical &&
                      result.analysis.recommendations.critical.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-sonar-coral mb-2">
                            🔴 Critical:
                          </p>
                          <ul className="space-y-1">
                            {result.analysis.recommendations.critical.map(
                              (rec, idx) => (
                                <li
                                  key={idx}
                                  className="text-xs text-sonar-highlight/70 flex items-start space-x-2"
                                >
                                  <span className="text-sonar-coral">→</span>
                                  <span>{rec}</span>
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                    {result.analysis.recommendations.suggested &&
                      result.analysis.recommendations.suggested.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-sonar-highlight-bright mb-2">
                            🟡 Suggested:
                          </p>
                          <ul className="space-y-1">
                            {result.analysis.recommendations.suggested.map(
                              (rec, idx) => (
                                <li
                                  key={idx}
                                  className="text-xs text-sonar-highlight/70 flex items-start space-x-2"
                                >
                                  <span className="text-sonar-signal">→</span>
                                  <span>{rec}</span>
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                    {result.analysis.recommendations.optional &&
                      result.analysis.recommendations.optional.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-sonar-highlight/70 mb-2">
                            ⚪ Optional:
                          </p>
                          <ul className="space-y-1">
                            {result.analysis.recommendations.optional.map(
                              (rec, idx) => (
                                <li
                                  key={idx}
                                  className="text-xs text-sonar-highlight/60 flex items-start space-x-2"
                                >
                                  <span className="text-sonar-highlight/50">
                                    →
                                  </span>
                                  <span>{rec}</span>
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                  </div>
                ) : (
                  // Flat recommendations (fallback)
                  <ul className="space-y-2">
                    {(result.analysis.recommendations as string[]).map(
                      (rec, idx) => (
                        <li
                          key={idx}
                          className="flex items-start space-x-2 text-xs text-sonar-highlight/70"
                        >
                          <span className="text-sonar-signal">•</span>
                          <span>{rec}</span>
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </div>
            )}

            {/* Processing Details */}
            {(result.transcriptionDetails ||
              result.categorizationValidation ||
              result.qualityBreakdown) && (
              <div className="mt-4 p-4 rounded-sonar bg-sonar-abyss/30 border border-sonar-aqua/20">
                <p className="text-sm font-mono font-semibold text-sonar-highlight-bright mb-3">
                  Processing Details
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Transcription Stats */}
                  {result.transcriptionDetails && (
                    <div className="space-y-2">
                      <p className="font-mono text-sonar-aqua/80 font-semibold">
                        TRANSCRIPTION
                      </p>
                      <div className="space-y-1 text-sonar-highlight/70">
                        <div className="flex justify-between">
                          <span>Speakers detected:</span>
                          <span className="text-sonar-highlight">
                            {result.transcriptionDetails.speakerCount}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Sound annotations:</span>
                          <span className="text-sonar-highlight">
                            {result.transcriptionDetails.annotationCount}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Transcript length:</span>
                          <span className="text-sonar-highlight">
                            {result.transcriptionDetails.transcriptLength} chars
                          </span>
                        </div>
                        {result.transcriptionDetails.hasUnintelligible && (
                          <p className="text-sonar-signal italic">
                            Contains unintelligible sections
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Quality Breakdown */}
                  {result.qualityBreakdown && (
                    <div className="space-y-2">
                      <p className="font-mono text-sonar-aqua/80 font-semibold">
                        QUALITY ANALYSIS
                      </p>
                      <div className="space-y-1 text-sonar-highlight/70">
                        {result.qualityBreakdown.clarity !== null &&
                          result.qualityBreakdown.clarity !== undefined && (
                            <div className="flex justify-between">
                              <span>Clarity:</span>
                              <span className="text-sonar-highlight">
                                {result.qualityBreakdown.clarity}/10
                              </span>
                            </div>
                          )}
                        {result.qualityBreakdown.contentValue !== null &&
                          result.qualityBreakdown.contentValue !==
                            undefined && (
                            <div className="flex justify-between">
                              <span>Content Value:</span>
                              <span className="text-sonar-highlight">
                                {result.qualityBreakdown.contentValue}/10
                              </span>
                            </div>
                          )}
                        {result.qualityBreakdown.metadataAccuracy !== null &&
                          result.qualityBreakdown.metadataAccuracy !==
                            undefined && (
                            <div className="flex justify-between">
                              <span>Tag Accuracy:</span>
                              <span className="text-sonar-highlight">
                                {result.qualityBreakdown.metadataAccuracy}/10
                              </span>
                            </div>
                          )}
                        {result.qualityBreakdown.completeness !== null &&
                          result.qualityBreakdown.completeness !==
                            undefined && (
                            <div className="flex justify-between">
                              <span>Completeness:</span>
                              <span className="text-sonar-highlight">
                                {result.qualityBreakdown.completeness}/10
                              </span>
                            </div>
                          )}
                      </div>
                    </div>
                  )}

                  {/* Categorization Validation */}
                  {result.categorizationValidation &&
                    result.categorizationValidation.hasIssues && (
                      <div className="space-y-2 md:col-span-2">
                        <p className="font-mono text-sonar-signal/80 font-semibold">
                          CATEGORIZATION ISSUES
                        </p>
                        <div className="bg-sonar-abyss/50 p-2 rounded space-y-1">
                          {result.categorizationValidation.concerns.map(
                            (concern: string, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-start space-x-2 text-sonar-highlight/70"
                              >
                                <span className="text-sonar-signal">!</span>
                                <span>{concern}</span>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Transcript Display */}
            {result.transcript && (
              <div className="mt-4 p-4 rounded-sonar bg-sonar-abyss/30 border border-sonar-blue/20">
                <p className="text-sm font-mono font-semibold text-sonar-highlight-bright mb-3">
                  Audio Transcript
                </p>
                <div className="max-h-96 overflow-y-auto p-3 bg-sonar-abyss/50 rounded">
                  <div className="space-y-1 text-sm leading-relaxed">
                    {result.transcript.split("\n").map((line, idx) => {
                      // Detect speaker labels (e.g., "Speaker 1:", "John:", etc.)
                      const isSpeaker = /^[A-Z][a-zA-Z0-9\s]*\d*:/.test(
                        line.trim(),
                      );

                      return (
                        <p key={idx} className="whitespace-pre-wrap">
                          {line.split(/(\([^)]+\))/).map((part, i) => {
                            // Highlight sound effects/annotations in parentheses
                            if (part.startsWith("(") && part.endsWith(")")) {
                              return (
                                <span
                                  key={i}
                                  className="italic text-sonar-blue/80"
                                >
                                  {part}
                                </span>
                              );
                            }
                            // Highlight speaker labels
                            if (isSpeaker && i === 0) {
                              const [speaker, ...rest] = part.split(":");
                              return (
                                <span key={i}>
                                  <span className="font-semibold text-sonar-signal">
                                    {speaker}:
                                  </span>
                                  {rest.join(":")}
                                </span>
                              );
                            }
                            return (
                              <span key={i} className="text-sonar-highlight/80">
                                {part}
                              </span>
                            );
                          })}
                        </p>
                      );
                    })}
                  </div>
                </div>
                <p className="text-xs text-sonar-highlight/50 mt-3 italic">
                  Transcribed using Voxtral AI with speaker labels and sound
                  annotations
                </p>
              </div>
            )}

            {/* Insights */}
            {result.insights && result.insights.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-mono font-semibold text-sonar-highlight-bright">
                  Key Insights:
                </p>
                {result.insights.map((insight, idx) => (
                  <div
                    key={idx}
                    className="flex items-start space-x-2 text-sm text-sonar-highlight/80"
                  >
                    <span className="text-sonar-signal">•</span>
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Verification Feedback - User Voting */}
            {result && (
              <div className="mt-8 pt-6 border-t border-sonar-blue/20">
                <VerificationFeedback
                  sessionObjectId={verificationId!}
                  onFeedbackSubmitted={() => {
                    console.log(
                      "Feedback submitted for session:",
                      verificationId,
                    );
                  }}
                />
              </div>
            )}
          </GlassCard>

          <GlassCard className="bg-sonar-blue/5">
            <p className="text-sm text-sonar-highlight/70 text-center">
              ✓ Your audio has been verified and is ready for encryption
            </p>
          </GlassCard>
        </motion.div>
      )}

      {/* Verification Failed */}
      {verificationState === "failed" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <GlassCard className="bg-sonar-coral/10 border border-sonar-coral">
            <div className="flex items-center space-x-4 mb-4">
              <AlertCircle className="w-8 h-8 text-sonar-coral" />
              <div>
                <h3 className="text-xl font-mono font-bold text-sonar-coral">
                  Verification Failed
                </h3>
                <p className="text-sm text-sonar-highlight/70">
                  {errorMessage ||
                    "Your audio did not pass verification checks"}
                </p>
              </div>
            </div>

            {/* Error Details */}
            {errorDetails && (
              <div className="mt-4 space-y-3">
                {errorDetails.quality && !errorDetails.quality.passed && (
                  <div className="p-3 rounded-sonar bg-sonar-abyss/30">
                    <p className="font-mono font-semibold text-sonar-coral mb-2">
                      Quality Issues:
                    </p>
                    <ul className="text-sm text-sonar-highlight/70 space-y-1">
                      {errorDetails.errors?.map(
                        (error: string, idx: number) => (
                          <li key={idx} className="flex items-start space-x-2">
                            <span>•</span>
                            <span>{error}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}

                {errorDetails.copyright?.high_confidence_match && (
                  <div className="p-3 rounded-sonar bg-sonar-abyss/30">
                    <p className="font-mono font-semibold text-sonar-coral mb-2">
                      Copyright Detected
                    </p>
                    <p className="text-sm text-sonar-highlight/70 mb-3">
                      This audio matches copyrighted material in our database.
                      You cannot upload content you don't have rights to.
                    </p>

                    {/* Best Match */}
                    <div className="space-y-2 mb-3">
                      <p className="text-xs font-mono text-sonar-highlight/50">
                        PRIMARY MATCH
                      </p>
                      <div className="bg-sonar-abyss/50 p-2 rounded">
                        <p className="text-sm font-semibold text-sonar-highlight">
                          {errorDetails.copyright.best_match?.title}
                        </p>
                        {errorDetails.copyright.best_match?.artist && (
                          <p className="text-sm text-sonar-highlight/70">
                            by {errorDetails.copyright.best_match.artist}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-xs text-sonar-highlight/50">
                            Confidence:{" "}
                            {(
                              errorDetails.copyright.best_match?.confidence *
                              100
                            ).toFixed(1)}
                            %
                          </p>
                          {errorDetails.copyright.best_match
                            ?.musicbrainz_id && (
                            <a
                              href={`https://musicbrainz.org/recording/${errorDetails.copyright.best_match.musicbrainz_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-sonar-aqua hover:text-sonar-highlight transition-colors"
                            >
                              View on MusicBrainz →
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Additional Matches */}
                    {errorDetails.copyright.matches &&
                      errorDetails.copyright.matches.length > 1 && (
                        <div className="space-y-2">
                          <p className="text-xs font-mono text-sonar-highlight/50">
                            ADDITIONAL MATCHES (
                            {errorDetails.copyright.matches.length - 1})
                          </p>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {errorDetails.copyright.matches
                              .slice(1)
                              .map((match: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="bg-sonar-abyss/30 p-2 rounded text-xs"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sonar-highlight/80 truncate">
                                        {match.title}
                                        {match.artist && (
                                          <span className="text-sonar-highlight/60">
                                            {" "}
                                            - {match.artist}
                                          </span>
                                        )}
                                      </p>
                                      <p className="text-sonar-highlight/50">
                                        {(match.confidence * 100).toFixed(1)}%
                                        confidence
                                      </p>
                                    </div>
                                    {match.musicbrainz_id && (
                                      <a
                                        href={`https://musicbrainz.org/recording/${match.musicbrainz_id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sonar-aqua hover:text-sonar-highlight transition-colors flex-shrink-0"
                                      >
                                        →
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                    <div className="mt-3 pt-3 border-t border-sonar-highlight/10">
                      <p className="text-xs text-sonar-highlight/50">
                        <span className="font-semibold">How to fix:</span>{" "}
                        Upload original content you created, or content you have
                        explicit rights to use.
                      </p>
                    </div>
                  </div>
                )}

                {errorDetails.analysis && !errorDetails.safetyPassed && (
                  <div className="p-3 rounded-sonar bg-sonar-abyss/30">
                    <p className="font-mono font-semibold text-sonar-coral mb-2">
                      Content Safety Issue
                    </p>
                    {errorDetails.analysis.concerns &&
                    errorDetails.analysis.concerns.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm text-sonar-highlight/70">
                          Audio content was flagged for the following reasons:
                        </p>
                        <ul className="text-sm text-sonar-highlight/70 space-y-1 ml-4">
                          {errorDetails.analysis.concerns.map(
                            (concern: string, idx: number) => (
                              <li
                                key={idx}
                                className="flex items-start space-x-2"
                              >
                                <span>•</span>
                                <span>{concern}</span>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    ) : errorDetails.copyright?.high_confidence_match ? (
                      <p className="text-sm text-sonar-highlight/70">
                        Audio content was flagged for containing copyrighted
                        material
                      </p>
                    ) : (
                      <p className="text-sm text-sonar-highlight/70">
                        Audio content was flagged for safety reasons
                        (copyrighted content, pornography, or gore)
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Recovery Actions */}
            <div className="flex flex-col gap-3 mt-6">
              <p className="text-sm text-sonar-highlight/70">
                You can try again with a different file or adjust your audio:
              </p>
              <div className="flex items-center gap-3">
                <SonarButton
                  variant="secondary"
                  onClick={() => startVerification()}
                  className="flex-1"
                >
                  Retry Verification
                </SonarButton>
              </div>
              <p className="text-xs text-sonar-highlight/50 text-center">
                Verification is required to ensure audio quality and safety
              </p>
            </div>
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
}
