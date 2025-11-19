const fs = require('fs');
const path = require('path');

const publishOutput = require('../publish-output.json');

function findObjectByType(type) {
    // Check created objects
    if (publishOutput.objectChanges) {
        const created = publishOutput.objectChanges.find(
            (change) => change.type === 'created' && change.objectType.includes(type)
        );
        if (created) return created.objectId;
    }

    // Fallback to effects.created if objectChanges not present (older format)
    if (publishOutput.effects && publishOutput.effects.created) {
        // This is harder because type isn't always explicit in effects.created
        // But objectChanges is standard for recent Sui versions.
    }

    return null;
}

function findPackageId() {
    if (publishOutput.objectChanges) {
        const published = publishOutput.objectChanges.find(
            (change) => change.type === 'published'
        );
        if (published) return published.packageId;
    }
    return null;
}

const packageId = findPackageId();
const treasuryCapId = findObjectByType('::coin::TreasuryCap');

if (!packageId) {
    console.error('Could not find Package ID');
    process.exit(1);
}

if (!treasuryCapId) {
    console.error('Could not find TreasuryCap ID');
    process.exit(1);
}

console.log(JSON.stringify({ packageId, treasuryCapId }));
