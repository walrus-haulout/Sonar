"use client";

import { useState, useEffect } from "react";
import { Coins, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import type { WalrusUploadResult } from "@/lib/types/upload";
import { buildSubmitBlobsTransaction } from "@/lib/walrus/buildRegisterBlobTransaction";
import { SonarButton } from "@/components/ui/SonarButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { getWalBalance, formatWal } from "@/lib/sui/wal-coin-utils";
import { estimateWalCost, mistToWal } from "@/lib/sui/walrus-constants";

interface PaymentStepProps {
  walrusUpload: WalrusUploadResult;
  onPaymentComplete: (txDigest: string) => void;
  onError: (error: string) => void;
}

const FIXED_PRICE_PER_FILE_MIST = 250_000_000; // 0.25 SUI per file
const MIST_PER_SUI = 1_000_000_000;

function formatMistToSui(mist: number) {
  const value = mist / MIST_PER_SUI;
  return Number(value.toFixed(9)).toString();
}

// Calculate total dataset price with 10% bundle discount for multi-file datasets
function calculateDatasetPriceMist(fileCount: number): number {
  const totalPrice = FIXED_PRICE_PER_FILE_MIST * fileCount;

  // Apply 10% bundle discount for 2+ files
  if (fileCount >= 2) {
    return Math.floor(totalPrice * 0.9); // 10% discount
  }

  return totalPrice;
}

/**
 * PaymentStep Component
 * Charges 0.25 SUI registration fee before verification
 * Calls blob_manager::submit_blobs which emits BlobsSubmitted event for backend indexing
 */
export function PaymentStep({
  walrusUpload,
  onPaymentComplete,
  onError,
}: PaymentStepProps) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [paymentState, setPaymentState] = useState<
    "idle" | "signing" | "broadcasting" | "confirming" | "completed"
  >("idle");
  const [walBalance, setWalBalance] = useState<bigint>(0n);
  const [walCostEstimate, setWalCostEstimate] = useState<number>(0);
  const [isCheckingWal, setIsCheckingWal] = useState(false);

  const fileCount = walrusUpload.files?.length || 1;
  const totalFeeMist = calculateDatasetPriceMist(fileCount);
  const totalFeeSui = formatMistToSui(totalFeeMist);

  // Check WAL balance and calculate storage cost
  useEffect(() => {
    if (!account) return;

    const checkWalAndEstimate = async () => {
      setIsCheckingWal(true);
      try {
        // Get WAL balance
        const balance = await getWalBalance(suiClient, account.address);
        setWalBalance(balance);

        // Estimate WAL cost for storage
        // Note: At this point, upload already happened and user paid WAL
        // This is just showing what was paid
        const files = walrusUpload.files || [walrusUpload];
        let totalCost = 0;

        for (const file of files) {
          const mainSize = (file as any).size || 0;
          const previewSize = 0; // Preview sizes are usually small
          const mainCost = estimateWalCost(mainSize, 26);
          const previewCost = estimateWalCost(previewSize, 26);
          totalCost += mainCost.total + previewCost.total;
        }

        setWalCostEstimate(totalCost);
      } catch (error) {
        console.error("[PaymentStep] Failed to check WAL balance:", error);
      } finally {
        setIsCheckingWal(false);
      }
    };

    checkWalAndEstimate();
  }, [account, suiClient, walrusUpload]);

  const handlePayment = async () => {
    if (!account) {
      onError("Please connect your wallet first");
      return;
    }

    // Check if already paid (recovery flow)
    if (walrusUpload.txDigest) {
      console.log(
        "[PaymentStep] Already paid, tx digest:",
        walrusUpload.txDigest,
      );
      onPaymentComplete(walrusUpload.txDigest);
      return;
    }

    try {
      setPaymentState("signing");

      // For single file, use primary blob IDs
      if (!walrusUpload.files || walrusUpload.files.length <= 1) {
        const mainBlobId = walrusUpload.blobId;
        const previewBlobId =
          walrusUpload.previewBlobId || walrusUpload.files?.[0]?.previewBlobId;
        const sealPolicyId = walrusUpload.seal_policy_id;
        const durationSeconds = Math.max(
          1,
          Math.floor(walrusUpload.files?.[0]?.duration ?? 3600),
        );

        if (!mainBlobId || !previewBlobId || !sealPolicyId) {
          onError(
            "Missing blob information. Please go back and re-upload your file.",
          );
          setPaymentState("idle");
          return;
        }

        console.log("[PaymentStep] Building single-file payment transaction:", {
          mainBlobId: mainBlobId.substring(0, 20) + "...",
          previewBlobId: previewBlobId.substring(0, 20) + "...",
          sealPolicyId: sealPolicyId.substring(0, 20) + "...",
          durationSeconds,
          feeSui: totalFeeSui,
        });

        const tx = buildSubmitBlobsTransaction({
          mainBlobId,
          previewBlobId,
          sealPolicyId,
          durationSeconds,
        });

        setPaymentState("broadcasting");

        signAndExecute(
          { transaction: tx },
          {
            onSuccess: async (result) => {
              setPaymentState("confirming");
              console.log(
                "[PaymentStep] Payment transaction submitted:",
                result.digest,
              );

              try {
                // Wait for transaction confirmation
                await suiClient.waitForTransaction({
                  digest: result.digest,
                });

                console.log("[PaymentStep] Payment confirmed:", result.digest);
                setPaymentState("completed");

                // Save txDigest to wizard state
                onPaymentComplete(result.digest);
              } catch (confirmError) {
                console.error(
                  "[PaymentStep] Transaction confirmation failed:",
                  confirmError,
                );
                const errorMsg =
                  confirmError instanceof Error
                    ? confirmError.message
                    : "Failed to confirm transaction";
                onError(errorMsg);
                setPaymentState("idle");
              }
            },
            onError: (error) => {
              console.error("[PaymentStep] Payment transaction failed:", error);
              setPaymentState("idle");
              onError(error.message || "Failed to submit payment transaction");
            },
          },
        );
      } else {
        // Multi-file: Loop submit_blobs for each file
        onError(
          "Multi-file payment not yet implemented. Please upload files one at a time.",
        );
        setPaymentState("idle");
        // TODO: Implement multi-file loop
      }
    } catch (error) {
      console.error("[PaymentStep] Payment error:", error);
      setPaymentState("idle");
      onError(
        error instanceof Error ? error.message : "Failed to process payment",
      );
    }
  };

  const paymentDisabled = isPending || paymentState !== "idle";

  return (
    <div className="space-y-6">
      {/* Wallet Connection Check */}
      {!account ? (
        <GlassCard className="bg-sonar-coral/10 border border-sonar-coral">
          <div className="flex items-center space-x-4">
            <Coins className="w-8 h-8 text-sonar-coral" />
            <div>
              <h3 className="text-lg font-mono font-bold text-sonar-coral">
                Wallet Not Connected
              </h3>
              <p className="text-sm text-sonar-highlight/70 mt-1">
                Please connect your Sui wallet to continue with payment.
              </p>
            </div>
          </div>
        </GlassCard>
      ) : (
        <>
          {/* Payment Info */}
          <GlassCard className="bg-sonar-blue/5 border-2 border-sonar-blue/30">
            <div className="flex items-start space-x-4">
              <Coins className="w-6 h-6 text-sonar-blue mt-0.5" />
              <div className="flex-1">
                <h4 className="font-mono font-semibold text-sonar-blue mb-2">
                  Registration Fee Required
                </h4>
                <p className="text-sm text-sonar-highlight/80 mb-3">
                  To prevent spam and ensure quality, we charge a one-time
                  registration fee of 0.25 SUI per file. This fee is paid before
                  AI verification runs.
                </p>

                {(() => {
                  const pricePerFileMist = FIXED_PRICE_PER_FILE_MIST;
                  const subtotalMist = pricePerFileMist * fileCount;
                  const discountMist = subtotalMist - totalFeeMist;

                  const pricePerFileLabel = formatMistToSui(pricePerFileMist);
                  const subtotalLabel = formatMistToSui(subtotalMist);
                  const discountLabel = formatMistToSui(discountMist);

                  return (
                    <div className="space-y-2">
                      <div className="p-3 rounded-sonar bg-sonar-abyss/30 border border-sonar-blue/20">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs text-sonar-highlight/70">
                            Price per file:
                          </span>
                          <span className="font-mono font-bold text-sonar-signal">
                            {pricePerFileLabel} SUI
                          </span>
                        </div>
                        {fileCount > 1 && (
                          <>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs text-sonar-highlight/70">
                                Number of files:
                              </span>
                              <span className="font-mono font-bold text-sonar-highlight">
                                {fileCount}
                              </span>
                            </div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs text-sonar-highlight/70">
                                Subtotal:
                              </span>
                              <span className="font-mono text-sonar-highlight">
                                {subtotalLabel} SUI
                              </span>
                            </div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs text-sonar-signal">
                                Bundle discount (10%):
                              </span>
                              <span className="font-mono text-sonar-signal">
                                -{discountLabel} SUI
                              </span>
                            </div>
                            <div className="h-px bg-sonar-blue/20 my-2" />
                          </>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-sonar-highlight/70 font-semibold">
                            Total Registration Fee:
                          </span>
                          <span className="font-mono font-bold text-sonar-signal text-lg">
                            {totalFeeSui} SUI
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-sonar-highlight/60 italic">
                        Fixed fee: 0.25 SUI per file
                        {fileCount > 1 && " • Bundle: 10% discount applied"}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </GlassCard>

          {/* WAL Storage Cost Info */}
          <GlassCard className="bg-sonar-purple/5 border-2 border-sonar-purple/30">
            <div className="flex items-start space-x-4">
              <Coins className="w-6 h-6 text-sonar-purple mt-0.5" />
              <div className="flex-1">
                <h4 className="font-mono font-semibold text-sonar-purple mb-2">
                  Walrus Storage Cost (Already Paid)
                </h4>
                <p className="text-sm text-sonar-highlight/80 mb-3">
                  Your files are stored on Walrus decentralized storage for ~26 days.
                  You paid WAL tokens directly to the network during upload.
                </p>

                <div className="p-3 rounded-sonar bg-sonar-abyss/30 border border-sonar-purple/20">
                  {isCheckingWal ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-sonar-purple" />
                      <span className="ml-2 text-xs text-sonar-highlight/60">
                        Checking WAL balance...
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-sonar-highlight/70">
                          Storage Cost (estimated):
                        </span>
                        <span className="font-mono font-bold text-sonar-purple">
                          ~{walCostEstimate.toFixed(4)} WAL
                        </span>
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-sonar-highlight/70">
                          Your WAL Balance:
                        </span>
                        <span className="font-mono text-sonar-highlight">
                          {formatWal(walBalance)} WAL
                        </span>
                      </div>
                      <div className="h-px bg-sonar-purple/20 my-2" />
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-sonar-highlight/70">
                          Storage Duration:
                        </span>
                        <span className="font-mono text-sonar-signal">
                          ~26 days (26 epochs)
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <p className="text-xs text-sonar-highlight/60 italic mt-2">
                  Note: WAL tokens were paid during upload to register blobs on-chain.
                  This fee is separate from the Sonar marketplace registration fee below.
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Why Pay Now? */}
          <GlassCard className="bg-sonar-signal/5">
            <div className="text-sm text-sonar-highlight/80 space-y-2">
              <p className="font-mono font-semibold text-sonar-signal">
                Why pay before verification?
              </p>
              <ul className="space-y-1 text-xs">
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-sonar-signal mt-0.5 flex-shrink-0" />
                  <span>
                    Prevents abuse of AI verification resources (transcription,
                    quality analysis)
                  </span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-sonar-signal mt-0.5 flex-shrink-0" />
                  <span>
                    Ensures commitment before using expensive verification
                    pipeline
                  </span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-sonar-signal mt-0.5 flex-shrink-0" />
                  <span>
                    If verification fails, you can retry without paying again
                  </span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-sonar-signal mt-0.5 flex-shrink-0" />
                  <span>
                    Receipt is saved - browser refresh won't lose your payment
                  </span>
                </li>
              </ul>
            </div>
          </GlassCard>

          {/* Payment Button */}
          <div className="flex flex-col items-center space-y-4">
            {paymentState === "idle" && (
              <SonarButton
                variant="primary"
                onClick={handlePayment}
                disabled={paymentDisabled}
                className="w-full text-lg py-4"
              >
                Pay {totalFeeSui} SUI & Continue to Verification
              </SonarButton>
            )}

            {(paymentState === "signing" ||
              paymentState === "broadcasting" ||
              paymentState === "confirming") && (
              <GlassCard className="w-full bg-sonar-signal/10 border border-sonar-signal">
                <div className="flex items-center space-x-4">
                  <Loader2 className="w-6 h-6 text-sonar-signal animate-spin" />
                  <div className="flex-1">
                    <p className="font-mono font-semibold text-sonar-highlight-bright">
                      {paymentState === "signing" &&
                        "Waiting for wallet signature..."}
                      {paymentState === "broadcasting" &&
                        "Broadcasting transaction..."}
                      {paymentState === "confirming" &&
                        "Confirming on blockchain..."}
                    </p>
                    <p className="text-xs text-sonar-highlight/70 mt-1">
                      Please do not close this window
                    </p>
                  </div>
                </div>
              </GlassCard>
            )}

            {paymentState === "completed" && (
              <GlassCard className="w-full bg-sonar-signal/10 border border-sonar-signal">
                <div className="flex items-center space-x-4">
                  <CheckCircle className="w-6 h-6 text-sonar-signal" />
                  <div className="flex-1">
                    <p className="font-mono font-semibold text-sonar-highlight-bright">
                      Payment Confirmed!
                    </p>
                    <p className="text-xs text-sonar-highlight/70 mt-1">
                      Proceeding to verification...
                    </p>
                  </div>
                </div>
              </GlassCard>
            )}

            {/* What happens after payment */}
            {paymentState === "idle" && (
              <div className="text-center text-sm text-sonar-highlight/60 space-y-1 mt-2">
                <p>After payment:</p>
                <p className="text-xs">
                  Your audio will be verified by AI • You can retry verification
                  if needed • No additional fees until final publish
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
