'use client';

interface Props {
  className?: string;
  style?: React.CSSProperties;
}

/** Bloco placeholder cinza pulsante (sensação de carregando). */
export function Skeleton({ className = '', style }: Props) {
  return (
    <div
      className={`bg-gray-800/60 rounded animate-pulse ${className}`}
      style={style}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-2 w-full" />
    </div>
  );
}

export function SkeletonLinha({ height = 12 }: { height?: number }) {
  return <Skeleton className={`w-full`} style={{ height }} />;
}
