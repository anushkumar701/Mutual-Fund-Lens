import { useLocalStorage } from "./useLocalStorage";

export function useGoals() {
  const [goals, setGoals] = useLocalStorage("fundlens_goals", []);

  const addGoal = (goal) => {
    setGoals((prev) => [
      ...prev,
      {
        ...goal,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const updateGoal = (id, updates) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...updates } : g))
    );
  };

  const deleteGoal = (id) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  return {
    goals,
    addGoal,
    updateGoal,
    deleteGoal,
  };
}
