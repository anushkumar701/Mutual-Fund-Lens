// components/CategoryPill.jsx
import { inferCategory, CATEGORY_COLORS } from "../utils/goalFilters";

export default function CategoryPill({ category, schemeName }) {
  const cat = category || inferCategory(schemeName);
  const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS["Other"];
  return (
    <span
      className={`pill ${colors} font-bold uppercase tracking-wide text-[10px]`}
    >
      {cat}
    </span>
  );
}
