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
    console.group('[UploadPage] 🎯 Component Mounted - Setting hasMounted=true');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Account at mount:', account?.address || 'undefined');
    console.log('Reason: Allow wallet to hydrate before redirect check');
    console.groupEnd();

    hasMounted.current = true;
  }, []);

  // Only redirect after wallet hydration is complete
  useEffect(() => {
    console.group('[UploadPage] 🔄 Auth Effect Running');
    console.log('Timestamp:', new Date().toISOString());
    console.log('hasMounted:', hasMounted.current);
    console.log('Account:', account?.address || 'undefined');
    console.log('isOpen:', isOpen);

    if (hasMounted.current && !account) {
      console.warn('⚠️ [UploadPage] No account found after hydration - REDIRECTING to home');
      router.push('/');
    } else if (hasMounted.current && account) {
      console.log('✅ [UploadPage] Account connected - Ready to upload');
    } else {
      console.log('⏳ [UploadPage] Waiting for hydration...');
    }
    console.groupEnd();
  }, [account, router]);

  // Log render state
  console.log('[UploadPage] 📊 Render:', {
    timestamp: new Date().toISOString(),
    hasMounted: hasMounted.current,
    hasAccount: !!account,
    accountAddress: account?.address || 'undefined',
    isOpen,
  });

  // Show loading during initial hydration
  if (!hasMounted.current) {
    console.log('[UploadPage] ⏳ Still hydrating (hasMounted=false)');
    return null;
  }

  if (!account) {
    console.log('[UploadPage] ❌ No account after hydration - will redirect');
    return null;
  }

  const handleClose = () => {
    console.group('[UploadPage] 🔔 handleClose called');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Setting isOpen=false');
    console.groupEnd();
    setIsOpen(false);
  };

  console.log('[UploadPage] ✨ Rendering UploadWizard fullscreen');
  return (
    <UploadWizard
      open={isOpen}
      onOpenChange={handleClose}
      fullscreen={true}
    />
  );
}
