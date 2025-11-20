import { SealClient } from '@mysten/seal';

console.log("decrypt args:", SealClient.prototype.decrypt.length);
console.log("decrypt source:", SealClient.prototype.decrypt.toString().slice(0, 200));

try {
    // Try to instantiate with minimal options
    const client = new SealClient({ network: 'mainnet' } as any);
    console.log("Instantiated client");
} catch (e) {
    console.log("Instantiation failed:", (e as Error).message);
}
