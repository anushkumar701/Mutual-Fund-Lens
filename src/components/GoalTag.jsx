// components/GoalTag.jsx
export default function GoalTag({ goal }) {
  if (!goal) return null;
  return (
    <span className="inline-flex items-center gap-1 pill bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300 text-xs">
      <span>{goal.icon}</span>
      {goal.label}
    </span>
  );
}
