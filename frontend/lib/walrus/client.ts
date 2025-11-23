import { walrus } from "@mysten/walrus";
import { suiClient as defaultSuiClient, NETWORK } from "@/lib/sui/client";

let walrusClientInstance: ReturnType<typeof createWalrusClient> | null = null;

function createWalrusClient() {
  return defaultSuiClient.$extend(
    walrus({
      network: NETWORK === "testnet" ? "testnet" : "mainnet",
    }),
  );
}

export function getWalrusClient() {
  if (!walrusClientInstance) {
    walrusClientInstance = createWalrusClient();
  }
  return walrusClientInstance;
}
