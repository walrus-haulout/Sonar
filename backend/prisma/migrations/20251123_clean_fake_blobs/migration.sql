-- Delete all fake seeded blobs (those with 'full-' and 'preview-' prefixes from seed)
DELETE FROM "DatasetBlob"
WHERE "full_blob_id" LIKE 'full-%'
   OR "preview_blob_id" LIKE 'preview-%';

-- Delete all demo datasets that were seeded
DELETE FROM "Dataset"
WHERE "id" LIKE '0xdemo%';
