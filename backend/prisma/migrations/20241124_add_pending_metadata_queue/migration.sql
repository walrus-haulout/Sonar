-- CreateTable
CREATE TABLE "pending_metadata" (
    "id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "user_address" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "verification" JSONB,
    "metadata" JSONB,
    "tx_digest" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "pending_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_metadata_dataset_id_key" ON "pending_metadata"("dataset_id");

-- CreateIndex
CREATE INDEX "pending_metadata_status_next_retry_at_idx" ON "pending_metadata"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "pending_metadata_dataset_id_idx" ON "pending_metadata"("dataset_id");
