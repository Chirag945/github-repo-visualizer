"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Github } from "lucide-react"
import RepoChat from "@/components/repo-chat"
import { ThemeToggle } from "@/components/theme-toggle"
import { loadCachedSummaries } from "@/app/actions"

export default function ChatPage() {
  const router = useRouter()
  const [repoInfo, setRepoInfo] = useState<{ owner: string; repo: string; branch: string } | null>(null)
  const [fileSummaries, setFileSummaries] = useState<Record<string, any>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [apiProvider, setApiProvider] = useState<"groq" | "openai">("groq")
  const [apiKey, setApiKey] = useState("")

  // Add this function to handle navigation back to the main page
  const handleBackToMain = () => {
    // We don't need to do anything special here since we're already saving state in localStorage
    router.push("/")
  }

  useEffect(() => {
    // Load data from localStorage
    const loadData = () => {
      try {
        const storedRepoInfo = localStorage.getItem("repoInfo")
        const storedApiProvider = localStorage.getItem("apiProvider") as "groq" | "openai"
        const storedGroqApiKey = localStorage.getItem("groqApiKey")
        const storedOpenaiApiKey = localStorage.getItem("openaiApiKey")

        if (storedRepoInfo) {
          const parsedRepoInfo = JSON.parse(storedRepoInfo)
          setRepoInfo(parsedRepoInfo)

          // Load cached summaries for this repository
          if (parsedRepoInfo) {
            loadCachedSummaries(parsedRepoInfo.owner, parsedRepoInfo.repo)
              .then((summaries) => {
                setFileSummaries(summaries)
                setIsLoading(false)
              })
              .catch((error) => {
                console.error("Failed to load cached summaries:", error)
                setIsLoading(false)
              })
          }
        } else {
          setIsLoading(false)
        }

        if (storedApiProvider) {
          setApiProvider(storedApiProvider)
        }

        if (storedApiProvider === "groq" && storedGroqApiKey) {
          setApiKey(storedGroqApiKey)
        } else if (storedApiProvider === "openai" && storedOpenaiApiKey) {
          setApiKey(storedOpenaiApiKey)
        }
      } catch (error) {
        console.error("Error loading data from localStorage:", error)
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 pt-8 pb-16">
      <div className="container max-w-6xl px-4">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            {/* Update the back button to use our function */}
            <Button variant="outline" size="icon" onClick={handleBackToMain} className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-3xl md:text-4xl font-bold gradient-text">Repository Chat</h1>
          </div>
          <ThemeToggle />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-[600px] bg-white dark:bg-gray-800 rounded-lg shadow-lg">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-700 mx-auto mb-4"></div>
              <p className="text-gray-500 dark:text-gray-400">Loading repository data...</p>
            </div>
          </div>
        ) : repoInfo ? (
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-radial from-violet-500/10 to-transparent opacity-70 dark:from-violet-500/5 blur-3xl -z-10"></div>
            <div className="bg-white dark:bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
                <Github className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                <span className="font-medium">
                  {repoInfo.owner}/{repoInfo.repo}
                </span>
              </div>
              <RepoChat
                fileSummaries={fileSummaries}
                repoInfo={repoInfo}
                apiProvider={apiProvider}
                apiKey={apiKey}
                fullHeight
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[600px] bg-white dark:bg-gray-800 rounded-lg shadow-lg">
            <Github className="h-16 w-16 text-gray-300 dark:text-gray-600 mb-4" />
            <h2 className="text-xl font-medium text-gray-700 dark:text-gray-300 mb-2">No Repository Selected</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6 text-center max-w-md">
              Please go back to the main page and select a repository to chat about.
            </p>
            <Button onClick={() => router.push("/")} className="bg-violet-600 hover:bg-violet-700 text-white">
              Go to Repository Visualizer
            </Button>
          </div>
        )}
      </div>
    </main>
  )
}
