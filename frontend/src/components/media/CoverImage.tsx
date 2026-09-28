'use client';

import Image, { type ImageProps } from 'next/image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getCoverImageUrl } from '@/lib/coverImage';

type CoverImageProps = Omit<ImageProps, 'src' | 'onError' | 'unoptimized'> & {
  src?: string | null;
  fallback?: ReactNode;
  retryCount?: number;
  onFinalError?: () => void;
};

interface LoadState {
  attempt: number;
  failed: boolean;
  retrying: boolean;
  source: string;
}

const INITIAL_STATE: LoadState = {
  attempt: 0,
  failed: false,
  retrying: false,
  source: '',
};

export default function CoverImage({
  src,
  fallback = <span aria-hidden="true">AN</span>,
  retryCount = 2,
  onFinalError,
  alt,
  ...imageProps
}: CoverImageProps) {
  const source = src?.trim() || '';
  const [loadState, setLoadState] = useState<LoadState>(INITIAL_STATE);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentState = loadState.source === source
    ? loadState
    : { ...INITIAL_STATE, source };

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  if (!source || currentState.failed || currentState.retrying) return <>{fallback}</>;

  return (
    <Image
      {...imageProps}
      key={`${source}-${currentState.attempt}`}
      src={getCoverImageUrl(source, currentState.attempt)}
      alt={alt}
      unoptimized
      onError={() => {
        if (currentState.attempt >= retryCount) {
          setLoadState({ ...currentState, failed: true, retrying: false });
          onFinalError?.();
          return;
        }

        setLoadState({ ...currentState, retrying: true });
        retryTimerRef.current = setTimeout(() => {
          setLoadState({
            attempt: currentState.attempt + 1,
            failed: false,
            retrying: false,
            source,
          });
        }, 450 * (currentState.attempt + 1));
      }}
    />
  );
}
