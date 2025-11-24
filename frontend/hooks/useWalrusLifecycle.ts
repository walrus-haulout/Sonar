/**
 * useWalrusLifecycle
 *
 * Hook for managing Walrus blob lifecycle operations:
 * - Extend blob storage duration
 * - Delete blob and reclaim storage fees
 * - Transfer blob ownership
 */

import { useCallback } from "react";
import {
  useSuiClient,
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { getWalrusClient } from "@/lib/walrus/client";
import { getWalBalance, formatWal } from "@/lib/sui/wal-coin-utils";
import { estimateWalCost, walToMist } from "@/lib/sui/walrus-constants";

export function useWalrusLifecycle() {
  const suiClient = useSuiClient();
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  /**
   * Extend blob storage duration by additional epochs
   * User must pay additional WAL tokens for the extension
   */
  const extendBlob = useCallback(
    async (blobObjectId: string, additionalEpochs: number) => {
      if (!currentAccount) {
        throw new Error("Wallet not connected");
      }

      const walrusClient = getWalrusClient();

      // Get blob size to calculate extension cost
      const blobObject = await suiClient.getObject({
        id: blobObjectId,
        options: { showContent: true },
      });

      if (!blobObject.data?.content || blobObject.data.content.dataType !== "moveObject") {
        throw new Error("Blob object not found or invalid");
      }

      const blobSize = (blobObject.data.content.fields as any).size;

      // Calculate WAL cost for extension
      const extensionCost = estimateWalCost(blobSize, additionalEpochs);
      const requiredWalMist = walToMist(extensionCost.total);

      // Check WAL balance
      const walBalance = await getWalBalance(suiClient, currentAccount.address);
      if (walBalance < requiredWalMist) {
        throw new Error(
          `Insufficient WAL tokens for extension. ` +
          `Required: ${extensionCost.total.toFixed(4)} WAL, ` +
          `Available: ${formatWal(walBalance)} WAL.`
        );
      }

      // Create extension transaction
      const tx = new Transaction();
      await walrusClient.extendBlobTransaction({
        blobObjectId,
        additionalEpochs,
        transaction: tx,
      });

      console.log("[Walrus Lifecycle] Extending blob:", {
        blobObjectId,
        additionalEpochs,
        cost: extensionCost.total.toFixed(4),
      });

      const result = await signAndExecute({ transaction: tx });
      console.log("[Walrus Lifecycle] Blob extended:", result.digest);

      return result;
    },
    [suiClient, currentAccount, signAndExecute]
  );

  /**
   * Delete blob and reclaim storage fees
   * Only works for deletable blobs
   */
  const deleteBlob = useCallback(
    async (blobObjectId: string) => {
      if (!currentAccount) {
        throw new Error("Wallet not connected");
      }

      const walrusClient = getWalrusClient();

      // Check if blob is deletable
      const blobObject = await suiClient.getObject({
        id: blobObjectId,
        options: { showContent: true },
      });

      if (!blobObject.data?.content || blobObject.data.content.dataType !== "moveObject") {
        throw new Error("Blob object not found or invalid");
      }

      const isDeletable = (blobObject.data.content.fields as any).deletable;
      if (!isDeletable) {
        throw new Error(
          "Blob is not deletable. Only blobs registered with deletable=true can be deleted."
        );
      }

      // Create deletion transaction
      const tx = new Transaction();
      await walrusClient.deleteBlobTransaction({
        blobObjectId,
        transaction: tx,
      });

      console.log("[Walrus Lifecycle] Deleting blob:", blobObjectId);

      const result = await signAndExecute({ transaction: tx });
      console.log("[Walrus Lifecycle] Blob deleted, fees reclaimed:", result.digest);

      return result;
    },
    [suiClient, currentAccount, signAndExecute]
  );

  /**
   * Transfer blob ownership to another address
   */
  const transferBlob = useCallback(
    async (blobObjectId: string, recipientAddress: string) => {
      if (!currentAccount) {
        throw new Error("Wallet not connected");
      }

      const tx = new Transaction();
      tx.transferObjects([tx.object(blobObjectId)], recipientAddress);

      console.log("[Walrus Lifecycle] Transferring blob:", {
        blobObjectId,
        from: currentAccount.address,
        to: recipientAddress,
      });

      const result = await signAndExecute({ transaction: tx });
      console.log("[Walrus Lifecycle] Blob transferred:", result.digest);

      return result;
    },
    [currentAccount, signAndExecute]
  );

  /**
   * Get blob metadata including expiry and size
   */
  const getBlobMetadata = useCallback(
    async (blobObjectId: string) => {
      const blobObject = await suiClient.getObject({
        id: blobObjectId,
        options: { showContent: true },
      });

      if (!blobObject.data?.content || blobObject.data.content.dataType !== "moveObject") {
        throw new Error("Blob object not found");
      }

      const fields = blobObject.data.content.fields as any;

      return {
        blobId: fields.blob_id,
        size: fields.size,
        encodingType: fields.encoding_type,
        endEpoch: fields.end_epoch,
        deletable: fields.deletable,
        storageId: fields.storage?.fields?.id,
        certifiedEpoch: fields.certified_epoch,
      };
    },
    [suiClient]
  );

  return {
    extendBlob,
    deleteBlob,
    transferBlob,
    getBlobMetadata,
  };
}
