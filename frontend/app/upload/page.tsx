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
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Mark component as mounted and start auth grace period
  useEffect(() => {
    console.group('[UploadPage] 🎯 Component Mounted');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Account at mount:', account?.address || 'undefined');
    console.log('Starting 500ms grace period for wallet connection...');
    console.groupEnd();

    hasMounted.current = true;

    // Give wallet 500ms to connect before checking auth
    const authTimer = setTimeout(() => {
      console.log('[UploadPage] ⏰ Auth grace period expired - checking account status');
      setIsCheckingAuth(false);
    }, 500);

    return () => {
      clearTimeout(authTimer);
    };
  }, []);

  // Only redirect AFTER grace period and if still no account
  useEffect(() => {
    console.group('[UploadPage] 🔄 Auth Effect');
    console.log('Timestamp:', new Date().toISOString());
    console.log('hasMounted:', hasMounted.current);
    console.log('isCheckingAuth:', isCheckingAuth);
    console.log('Account:', account?.address || 'undefined');

    if (!isCheckingAuth && !account) {
      console.warn('⚠️ [UploadPage] No account after grace period - REDIRECTING to home');
      router.push('/');
    } else if (account) {
      console.log('✅ [UploadPage] Account connected - Ready to upload');
      setIsCheckingAuth(false);
    } else {
      console.log('⏳ [UploadPage] Wallet still connecting...');
    }
    console.groupEnd();
  }, [account, router, isCheckingAuth]);

  console.log('[UploadPage] 📊 Render:', {
    timestamp: new Date().toISOString(),
    hasMounted: hasMounted.current,
    isCheckingAuth,
    hasAccount: !!account,
    accountAddress: account?.address || 'undefined',
    isOpen,
  });

  // Show loading during auth grace period
  if (isCheckingAuth) {
    console.log('[UploadPage] ⏳ Waiting for wallet connection...');
    return null;
  }

  if (!account) {
    console.log('[UploadPage] ❌ No account - redirect pending');
    return null;
  }

  const handleClose = () => {
    console.group('[UploadPage] 🔔 handleClose called');
    console.log('Timestamp:', new Date().toISOString());
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
