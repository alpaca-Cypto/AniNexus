export interface CoverSource {
  image?: string | null;
  images?: {
    large?: string | null;
    common?: string | null;
    medium?: string | null;
    small?: string | null;
  } | null;
}

export function getSubjectCover(subject?: CoverSource | null): string | null {
  return subject?.images?.large
    || subject?.images?.common
    || subject?.images?.medium
    || subject?.image
    || subject?.images?.small
    || null;
}

export function getCoverImageUrl(source: string, retryAttempt = 0): string {
  if (!/^https?:\/\//i.test(source)) return source;

  const params = new URLSearchParams({ url: source });
  if (retryAttempt > 0) params.set('retry', String(retryAttempt));
  return `/api/cover?${params.toString()}`;
}
