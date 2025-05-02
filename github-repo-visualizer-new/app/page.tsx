import GitHubRepoVisualizer from "@/components/github-repo-visualizer"
import { ThemeToggle } from "@/components/theme-toggle"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 pt-8 pb-16">
      <div className="container max-w-6xl px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold gradient-text">GitHub Repo Visualizer</h1>
          <ThemeToggle />
        </div>
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-radial from-violet-500/10 to-transparent opacity-70 dark:from-violet-500/5 blur-3xl -z-10"></div>
          <GitHubRepoVisualizer />
        </div>
      </div>
    </main>
  )
}
