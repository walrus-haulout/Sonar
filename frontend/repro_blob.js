
function base64UrlToBigInt(base64Url) {
    // 1. Convert base64url to base64
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    const padding = base64.length % 4;
    if (padding) {
        base64 += '='.repeat(4 - padding);
    }

    // 2. Decode base64 to binary string
    // Node.js doesn't have atob in global scope in older versions, but let's try or use Buffer
    let binary;
    if (typeof atob === 'function') {
        binary = atob(base64);
    } else {
        binary = Buffer.from(base64, 'base64').toString('binary');
    }

    // 3. Convert binary to hex
    let hex = '0x';
    for (let i = 0; i < binary.length; i++) {
        const byte = binary.charCodeAt(i).toString(16).padStart(2, '0');
        hex += byte;
    }

    // 4. Convert hex to BigInt
    return BigInt(hex);
}

const blobId = "0znzekjpO3JX6yXSxLrcnVPTmdl0q68f-WFCRGqLQUQ";
try {
    const result = base64UrlToBigInt(blobId);
    console.log("Blob ID:", blobId);
    console.log("Result BigInt:", result.toString());
    console.log("Result Hex:", result.toString(16));
} catch (e) {
    console.error("Error:", e);
}
