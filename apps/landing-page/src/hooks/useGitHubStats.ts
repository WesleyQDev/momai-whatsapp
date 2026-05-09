import { useEffect, useState } from "react";
import { REPO } from "@/constants";

interface GitHubStats {
  stars: number;
  forks: number;
  loading: boolean;
  error: boolean;
}

export function useGitHubStats(): GitHubStats {
  const [stats, setStats] = useState<GitHubStats>({
    stars: 0,
    forks: 0,
    loading: true,
    error: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        const res = await fetch(`https://api.github.com/repos/${REPO}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (!cancelled) {
          setStats({
            stars: data.stargazers_count || 0,
            forks: data.forks_count || 0,
            loading: false,
            error: false,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setStats((s) => ({ ...s, loading: false, error: true }));
        }
      }
    }

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, []);

  return stats;
}
