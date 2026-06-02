// components/SkeletonCard.jsx
export default function SkeletonCard() {
  return (
    <div className="card p-5 space-y-3 animate-pulse">
      <div className="skeleton h-3 w-1/3 rounded-full" />
      <div className="skeleton h-4 w-full rounded" />
      <div className="skeleton h-4 w-5/6 rounded" />
      <div className="flex items-center justify-between mt-2">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-8 w-24 rounded-lg" />
      </div>
    </div>
  );
}
