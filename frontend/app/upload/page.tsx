'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { UploadWizard } from '@/components/upload/UploadWizard';

export default function UploadPage() {
  const account = useCurrentAccount();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    if (!account) {
      router.push('/');
    }
  }, [account, router]);

  if (!account) {
    return null;
  }

  const handleClose = () => {
    setIsOpen(false);
    // User stays on page; let them navigate manually via back button
  };

  return (
    <UploadWizard
      open={isOpen}
      onOpenChange={handleClose}
      fullscreen={true}
    />
  );
}
