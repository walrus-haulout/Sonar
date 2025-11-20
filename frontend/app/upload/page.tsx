'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { UploadWizard } from '@/components/upload/UploadWizard';

export default function UploadPage() {
  const account = useCurrentAccount();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  const hasMounted = useRef(false);

  // Mark component as mounted after first render
  useEffect(() => {
    hasMounted.current = true;
  }, []);

  // Only redirect after wallet hydration is complete
  useEffect(() => {
    if (hasMounted.current && !account) {
      router.push('/');
    }
  }, [account, router]);

  // Show loading during initial hydration
  if (!hasMounted.current) {
    return null;
  }

  if (!account) {
    return null;
  }

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <UploadWizard
      open={isOpen}
      onOpenChange={handleClose}
      fullscreen={true}
    />
  );
}
