"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Loader2,
  AlertCircle,
  ExternalLink,
  Search,
  Github,
  Key,
  EyeOff,
  RefreshCw,
  FolderTree,
  Code,
  Info,
  GitCommit,
  BarChart,
  Split,
  Download,
  Brain,
  FileText,
  Sparkles,
  Database,
  MessageSquare,
} from "lucide-react"
import * as d3 from "d3-selection"
import { hierarchy } from "d3-hierarchy"
import { linkHorizontal } from "d3-shape"
import { tree } from "d3-hierarchy"
import { zoom } from "d3-zoom"
import { fetchCommitHistory, getRepoDownloadUrl } from "@/lib/github-api"
import FileSizeDistribution from "./file-size-distribution"
import CommitHistory from "./commit-history"
import RepoComparison from "./repo-comparison"
import {
  type FileSummary,
  fetchFileContent,
  summarizeFile,
  summarizeDirectory,
  loadCachedSummaries,
  loadSummarizedChildrenCounts,
  batchDeleteSummaries,
} from "@/app/actions"

// Add the import for the file utility
import { canFileBeSummarized } from "@/lib/file-utils"

// Add these imports at the top with the other imports
import DirectoryTreePopup from "./directory-tree-popup"

// Add these imports at the top with the other imports
import RepoChangesPopup from "./repo-changes-popup"
import { detectRepoChanges, removeDeletedSummaries } from "@/lib/repo-diff"

// Add this import at the top with the other imports
import { useRouter } from "next/navigation"

// Define types for repository data
interface RepoNode {
  name: string
  type: "file" | "directory"
  path: string
  url: string
  size?: number
  children?: RepoNode[]
  _children?: RepoNode[] // For collapsed nodes
  stats?: {
    files: number
    directories: number
  }
}

interface HierarchyNode extends d3.HierarchyNode<RepoNode> {
  x: number
  y: number
  children?: HierarchyNode[]
  _children?: HierarchyNode[]
}

// Define a type for repo changes
type RepoChangeType = "added" | "updated" | "deleted"

interface RepoChange {
  type: RepoChangeType
  node: RepoNode
}

export default function GitHubRepoVisualizer() {
  // Inside the GitHubRepoVisualizer component, add this line near the top with other hooks
  const router = useRouter()
  const [repoId, setRepoId] = useState("")
  const [token, setToken] = useState("")
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [groqApiKey, setGroqApiKey] = useState("")
  const [showGroqKeyInput, setShowGroqKeyInput] = useState(false)
  const [openaiApiKey, setOpenaiApiKey] = useState("")
  const [showOpenaiKeyInput, setShowOpenaiKeyInput] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<"groq" | "openai">("groq")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [repoData, setRepoData] = useState<RepoNode | null>(null)
  const [selectedNode, setSelectedNode] = useState<RepoNode | null>(null)
  const [filterText, setFilterText] = useState("")
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState("visualization")

  const [repoInfo, setRepoInfo] = useState<{ owner: string; repo: string; branch: string } | null>(null)

  // New state for file summary
  const [fileSummary, setFileSummary] = useState<FileSummary | null>(null)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  // New state for additional features
  const [commits, setCommits] = useState<any[]>([])
  const [isLoadingCommits, setIsLoadingCommits] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)

  // New state variable to track all file summaries with repo context:
  const [fileSummaries, setFileSummaries] = useState<Record<string, FileSummary>>({})
  const [isSummarizingDirectory, setIsSummarizingDirectory] = useState(false)
  const [directorySummaryError, setDirectorySummaryError] = useState<string | null>(null)
  const [summarizedChildrenCount, setSummarizedChildrenCount] = useState<Record<string, number>>({})

  // New state for cache loading
  const [isLoadingCache, setIsLoadingCache] = useState(false)
  const [cacheStats, setCacheStats] = useState<{ total: number; files: number; directories: number }>({
    total: 0,
    files: 0,
    directories: 0,
  })

  // Add this state after the other state declarations (around line 60)
  const [isTreePopupOpen, setIsTreePopupOpen] = useState(false)
  const [isBatchSummarizing, setIsBatchSummarizing] = useState(false)
  const [summarizationProgress, setSummarizationProgress] = useState(0)
  const [currentSummarizingItem, setCurrentSummarizingItem] = useState<string | null>(null)

  // Add these new state variables after the other state declarations
  const [previousRepoData, setPreviousRepoData] = useState<RepoNode | null>(null)
  // Add this new state variable after the other state declarations (around line 60-70)
  // Add it near where previousRepoData is declared

  const [previousRepoInfo, setPreviousRepoInfo] = useState<{ owner: string; repo: string; branch: string } | null>(null)
  const [repoChanges, setRepoChanges] = useState<RepoChange[]>([])
  const [showChangesPopup, setShowChangesPopup] = useState(false)

  // Add a new state variable to track files that need re-summarization
  // Add this after the other state declarations (around line 100)
  const [pendingUpdates, setPendingUpdates] = useState<Record<string, RepoNode>>({})

  // Add a new state variable to track which changes have been shown
  // Add this after the other state declarations
  const [shownChangesTimestamp, setShownChangesTimestamp] = useState<number | null>(null)

  // Add this useEffect near the top of the component, after all the state declarations
  useEffect(() => {
    // Load data from localStorage when the component mounts
    const loadSavedState = async () => {
      try {
        // Clear any existing error
        setError(null)

        // Load repository info first
        const savedRepoInfo = localStorage.getItem("repoInfo")

        if (savedRepoInfo) {
          const parsedRepoInfo = JSON.parse(savedRepoInfo)
          setRepoInfo(parsedRepoInfo)

          // Set the repoId in the format "username/repo" from the repoInfo
          const formattedRepoId = `${parsedRepoInfo.owner}/${parsedRepoInfo.repo}`
          setRepoId(formattedRepoId)

          // Load token
          const savedToken = localStorage.getItem("githubToken")
          if (savedToken) {
            setToken(savedToken)
          }

          // Load API keys
          const savedGroqApiKey = localStorage.getItem("groqApiKey")
          if (savedGroqApiKey) {
            setGroqApiKey(savedGroqApiKey)
          }

          const savedOpenaiApiKey = localStorage.getItem("openaiApiKey")
          if (savedOpenaiApiKey) {
            setOpenaiApiKey(savedOpenaiApiKey)
          }

          // Load provider
          const savedProvider = localStorage.getItem("apiProvider") as "groq" | "openai" | null
          if (savedProvider) {
            setSelectedProvider(savedProvider)
          }

          // Load pending updates
          // Update the useEffect that loads saved state to also load pending updates
          // Find the useEffect that starts with "// Load data from localStorage when the component mounts"
          // Add this code inside the loadSavedState function, near where other localStorage items are loaded:
          const savedPendingUpdates = localStorage.getItem("pendingUpdates")
          if (savedPendingUpdates) {
            try {
              setPendingUpdates(JSON.parse(savedPendingUpdates))
            } catch (error) {
              console.error("Error parsing pending updates:", error)
            }
          }

          // Indicate we're loading data
          setIsLoading(true)

          try {
            // Load cached summaries for this repository
            await loadCachedRepoSummaries(parsedRepoInfo.owner, parsedRepoInfo.repo)

            // Prepare headers for API request
            const headers = new Headers()
            headers.append("Accept", "application/vnd.github.v3+json")

            // Add token to headers if provided
            if (savedToken) {
              headers.append("Authorization", `token ${savedToken.trim()}`)
            }

            // Fetch root contents
            const response = await fetch(
              `https://api.github.com/repos/${parsedRepoInfo.owner}/${parsedRepoInfo.repo}/contents`,
              {
                headers: headers,
              },
            )

            if (!response.ok) {
              throw new Error(`Failed to fetch repository: ${response.statusText}`)
            }

            const contents = await response.json()

            // Build the hierarchical structure
            const root: RepoNode = {
              name: parsedRepoInfo.repo,
              type: "directory",
              path: "",
              children: [],
              url: `https://github.com/${parsedRepoInfo.owner}/${parsedRepoInfo.repo}`,
              stats: {
                files: 0,
                directories: 0,
              },
            }

            // Process initial files and directories
            await Promise.all(
              contents.map((item: any) =>
                processItem(
                  item,
                  root.children as RepoNode[],
                  parsedRepoInfo.owner,
                  parsedRepoInfo.repo,
                  parsedRepoInfo.branch,
                ),
              ),
            )

            // Calculate directory stats (recursive)
            calculateDirectoryStats(root)

            // Set flag to trigger animation on new data
            isNewDataRef.current = true
            isFirstRenderRef.current = true

            setRepoData(root)
            setActiveTab("visualization")

            // Automatically load commit history for the new repository
            loadCommitHistory()
          } catch (err) {
            console.error("Error loading repository data:", err)
            setError(err instanceof Error ? err.message : "Failed to fetch repository data")
          } finally {
            setIsLoading(false)
          }
        } else {
          // If we don't have repoInfo, check if we have just repoId
          const savedRepoId = localStorage.getItem("repoId")
          if (savedRepoId) {
            setRepoId(savedRepoId)
          }

          // Load token
          const savedToken = localStorage.getItem("githubToken")
          if (savedToken) {
            setToken(savedToken)
          }

          // Load API keys
          const savedGroqApiKey = localStorage.getItem("groqApiKey")
          if (savedGroqApiKey) {
            setGroqApiKey(savedGroqApiKey)
          }

          const savedOpenaiApiKey = localStorage.getItem("openaiApiKey")
          if (savedOpenaiApiKey) {
            setOpenaiApiKey(savedOpenaiApiKey)
          }

          // Load provider
          const savedProvider = localStorage.getItem("apiProvider") as "groq" | "openai" | null
          if (savedProvider) {
            setSelectedProvider(savedProvider)
          }
        }
      } catch (error) {
        console.error("Error loading saved state:", error)
        // Don't show error to user during initial load
      }
    }

    loadSavedState()
  }, [])

  const svgRef = useRef<SVGSVGElement>(null)
  const isNewDataRef = useRef(false)
  const isFirstRenderRef = useRef(true)

  // Helper function to get the summary key for a node
  const getSummaryKey = (node: RepoNode): string | null => {
    if (!repoInfo) return null
    return `${repoInfo.owner}/${repoInfo.repo}:${node.path}`
  }

  // Update the generateSummary function to use the selected provider
  // Function to generate summary
  const generateSummary = async (forceRefresh = false) => {
    const apiKey = selectedProvider === "groq" ? groqApiKey : openaiApiKey

    if (!apiKey || !selectedNode || selectedNode.type !== "file" || !repoInfo) {
      setSummaryError(
        `Cannot generate summary. ${selectedProvider === "groq" ? "Groq" : "OpenAI"} API key is required.`,
      )
      return
    }

    // Check if the file can be summarized based on its extension
    if (!canFileBeSummarized(selectedNode.name)) {
      setSummaryError(`This file type cannot be summarized. Only code and text files are supported.`)
      return
    }

    setIsSummarizing(true)
    setSummaryError(null)

    try {
      // First fetch the file content
      const content = await fetchFileContent(repoInfo.owner, repoInfo.repo, selectedNode.path, repoInfo.branch, token)

      // Then generate the summary
      const summary = await summarizeFile(
        content,
        selectedNode.name,
        apiKey,
        selectedProvider,
        repoInfo.owner,
        repoInfo.repo,
        selectedNode.path,
        forceRefresh,
      )

      // Create a unique key that includes the repository information
      const summaryKey = `${repoInfo.owner}/${repoInfo.repo}:${selectedNode.path}`

      // Store in fileSummaries state
      setFileSummaries((prev) => ({
        ...prev,
        [summaryKey]: summary,
      }))

      setFileSummary(summary)

      // Update cache stats if this is a new summary
      if (!summary.fromCache) {
        setCacheStats((prev) => ({
          ...prev,
          total: prev.total + 1,
          files: prev.files + 1,
          files: prev.files + 1,
        }))
      }

      // Update the generateSummary function to clear the pending update flag for the file
      // Find the generateSummary function and add this at the end, just before the final closing brace:
      // After successful summarization, remove the file from pendingUpdates if it was there
      if (repoInfo && selectedNode) {
        const key = `${repoInfo.owner}/${repoInfo.repo}:${selectedNode.path}`
        if (pendingUpdates[key]) {
          const newPendingUpdates = { ...pendingUpdates }
          delete newPendingUpdates[key]
          setPendingUpdates(newPendingUpdates)
          localStorage.setItem("pendingUpdates", JSON.stringify(newPendingUpdates))
        }
      }
    } catch (err) {
      console.error("Error generating summary:", err)
      setSummaryError(err instanceof Error ? err.message : "Failed to generate summary")
    } finally {
      setIsSummarizing(false)
    }
  }

  // Function to generate directory summary
  const generateDirectorySummary = async (forceRefresh = false) => {
    const apiKey = selectedProvider === "groq" ? groqApiKey : openaiApiKey

    if (!apiKey || !selectedNode || selectedNode.type !== "directory" || !repoInfo) {
      setDirectorySummaryError(
        `Cannot generate summary. ${selectedProvider === "groq" ? "Groq" : "OpenAI"} API key is required.`,
      )
      return
    }

    setIsSummarizingDirectory(true)
    setDirectorySummaryError(null)

    try {
      // Collect summaries of all children that have been summarized
      const childSummaries: { name: string; path: string; type: string; summary: string }[] = []

      // Helper function to recursively find all summarized children
      const findSummarizedChildren = (node: RepoNode) => {
        if (!node.children) return

        for (const child of node.children) {
          // Create a unique key that includes the repository information
          const summaryKey = `${repoInfo.owner}/${repoInfo.repo}:${child.path}`

          // If this child has a summary, add it
          if (fileSummaries[summaryKey]) {
            childSummaries.push({
              name: child.name,
              path: child.path,
              type: child.type,
              summary: fileSummaries[summaryKey].summary,
            })
          }

          // If this is a directory, check its children too
          if (child.type === "directory" && child.children) {
            findSummarizedChildren(child)
          }
        }
      }

      // Find the selected node in the repo data
      const findNodeInRepo = (node: RepoNode, path: string): RepoNode | null => {
        if (node.path === path) return node

        if (node.children) {
          for (const child of node.children) {
            const found = findNodeInRepo(child, path)
            if (found) return found
          }
        }

        return null
      }

      const directoryNode = findNodeInRepo(repoData!, selectedNode.path)

      if (directoryNode && directoryNode.children) {
        findSummarizedChildren(directoryNode)
      }

      // If no children have been summarized, show an error
      if (childSummaries.length === 0) {
        throw new Error("No summarized children found. Please summarize some files in this directory first.")
      }

      // Create a unique key that includes the repository information
      const summaryKey = `${repoInfo.owner}/${repoInfo.repo}:${selectedNode.path}`

      // Store the count of summarized children
      setSummarizedChildrenCount((prev) => ({
        ...prev,
        [summaryKey]: childSummaries.length,
      }))

      // Generate the directory summary
      const summary = await summarizeDirectory(
        selectedNode.name,
        selectedNode.path,
        childSummaries,
        apiKey,
        selectedProvider,
        repoInfo.owner,
        repoInfo.repo,
        forceRefresh,
      )

      // Store in fileSummaries state
      setFileSummaries((prev) => ({
        ...prev,
        [summaryKey]: summary,
      }))

      // Update cache stats if this is a new summary
      if (!summary.fromCache) {
        setCacheStats((prev) => ({
          ...prev,
          total: prev.total + 1,
          directories: prev.directories + 1,
        }))
      }
    } catch (err) {
      console.error("Error generating directory summary:", err)
      setDirectorySummaryError(err instanceof Error ? err.message : "Failed to generate directory summary")
    } finally {
      setIsSummarizingDirectory(false)
    }
  }

  // Add this function before the fetchRepoData function (around line 400)
  // Function to handle batch summarization
  // Add this function before the handleBatchSummarize function

  // Function to validate API key
  const validateApiKey = async (provider: "groq" | "openai", apiKey: string): Promise<boolean> => {
    if (!apiKey) return false

    try {
      if (provider === "groq") {
        const response = await fetch("https://api.groq.com/openai/v1/models", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        })
        return response.ok
      } else {
        const response = await fetch("https://api.openai.com/v1/models", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        })
        return response.ok
      }
    } catch (error) {
      console.error(`Error validating ${provider} API key:`, error)
      return false
    }
  }

  // Add this function before the fetchRepoData function
  // Function to handle updating summaries for changed files
  const handleUpdateSummaries = async (changes: RepoChange[]) => {
    if (!repoInfo) return

    const apiKey = selectedProvider === "groq" ? groqApiKey : openaiApiKey
    if (!apiKey) {
      setError(`${selectedProvider === "groq" ? "Groq" : "OpenAI"} API key is required for summarization.`)
      return
    }

    // Process added and updated files
    const nodesToUpdate = changes
      .filter((change) => change.type === "added" || change.type === "updated")
      .map((change) => change.node)

    // Process deleted files
    const deletedNodes = changes.filter((change) => change.type === "deleted").map((change) => change.node)

    // Remove summaries for deleted nodes from Redis and local state
    if (deletedNodes.length > 0) {
      // Remove from local state
      const updatedSummaries = removeDeletedSummaries(deletedNodes, fileSummaries, repoInfo.owner, repoInfo.repo)
      setFileSummaries(updatedSummaries)

      // Remove from Redis
      try {
        const pathsToDelete = deletedNodes.map((node) => ({
          path: node.path,
          type: node.type,
        }))

        await batchDeleteSummaries(repoInfo.owner, repoInfo.repo, pathsToDelete)
      } catch (error) {
        console.error("Failed to delete summaries from Redis:", error)
      }
    }

    // If there are no nodes to update, we're done
    if (nodesToUpdate.length === 0) return

    // Convert to the format expected by batch summarize
    const selectedNodes: Record<string, boolean> = {}
    nodesToUpdate.forEach((node) => {
      selectedNodes[node.path] = true
    })

    // Use the existing batch summarize function
    await handleBatchSummarize(selectedNodes, {})

    // After successful summarization, remove the updated nodes from pendingUpdates
    const newPendingUpdates = { ...pendingUpdates }
    nodesToUpdate.forEach((node) => {
      const key = `${repoInfo.owner}/${repoInfo.repo}:${node.path}`
      delete newPendingUpdates[key]
    })

    // Update state and localStorage
    setPendingUpdates(newPendingUpdates)
    localStorage.setItem("pendingUpdates", JSON.stringify(newPendingUpdates))
  }

  // Update the beginning of the handleBatchSummarize function to validate the API key first
  const handleBatchSummarize = async (
    selectedNodes: Record<string, boolean>,
    refreshNodes: Record<string, boolean>,
  ) => {
    if (!repoInfo) return

    const apiKey = selectedProvider === "groq" ? groqApiKey : openaiApiKey
    if (!apiKey) {
      throw new Error(`${selectedProvider === "groq" ? "Groq" : "OpenAI"} API key is required for summarization.`)
    }

    // Validate the API key before proceeding
    const isValidKey = await validateApiKey(selectedProvider, apiKey)
    if (!isValidKey) {
      throw new Error(
        `Invalid ${selectedProvider === "groq" ? "Groq" : "OpenAI"} API key. Please check your API key and try again.`,
      )
    }

    setIsBatchSummarizing(true)
    setSummarizationProgress(0)
    setCurrentSummarizingItem(null)

    try {
      // Get all selected file nodes first
      const fileNodes: RepoNode[] = []
      const dirNodes: RepoNode[] = []

      // Helper function to find nodes by path
      const findNodeByPath = (node: RepoNode, path: string): RepoNode | null => {
        if (node.path === path) return node

        if (node.children) {
          for (const child of node.children) {
            const found = findNodeByPath(child, path)
            if (found) return found
          }
        }

        return null
      }

      // Collect all selected nodes
      Object.keys(selectedNodes).forEach((path) => {
        if (!selectedNodes[path]) return

        const node = findNodeByPath(repoData!, path)
        if (!node) return

        if (node.type === "file") {
          fileNodes.push(node)
        } else {
          dirNodes.push(node)
        }
      })

      // Total items to process
      const totalItems = fileNodes.length + dirNodes.length
      let processedItems = 0

      console.log(`Processing ${fileNodes.length} files and ${dirNodes.length} directories`)

      // Process files first
      for (const fileNode of fileNodes) {
        setCurrentSummarizingItem(fileNode.path)
        console.log(`Processing file: ${fileNode.path}`)

        // Check if this node is marked for refresh
        const summaryKey = `${repoInfo.owner}/${repoInfo.repo}:${fileNode.path}`
        const shouldRefresh = refreshNodes[fileNode.path]

        // Skip if already summarized and not marked for refresh
        if (fileSummaries[summaryKey] && !shouldRefresh) {
          processedItems++
          setSummarizationProgress((processedItems / totalItems) * 100)

          // Notify the popup about progress
          window.postMessage(
            {
              type: "summarization-progress",
              progress: (processedItems / totalItems) * 100,
              currentItem: fileNode.path,
              current: processedItems,
            },
            "*",
          )

          continue
        }

        try {
          // Fetch file content
          const content = await fetchFileContent(repoInfo.owner, repoInfo.repo, fileNode.path, repoInfo.branch, token)
          console.log(`Fetched content for ${fileNode.path}, length: ${content.length}`)

          // Generate summary
          const apiKey = selectedProvider === "groq" ? groqApiKey : openaiApiKey
          if (!apiKey) {
            console.error(`No API key provided for ${selectedProvider}`)
            throw new Error(`${selectedProvider} API key is required for summarization`)
          }

          console.log(`Summarizing ${fileNode.path} with ${selectedProvider}${shouldRefresh ? " (refresh)" : ""}`)
          const summary = await summarizeFile(
            content,
            fileNode.name,
            apiKey,
            selectedProvider,
            repoInfo.owner,
            repoInfo.repo,
            fileNode.path,
            shouldRefresh, // Force refresh if marked
          )

          console.log(`Summary generated for ${fileNode.path}: ${summary.summary.substring(0, 50)}...`)

          // Update summaries state
          setFileSummaries((prev) => {
            const updated = {
              ...prev,
              [summaryKey]: summary,
            }
            console.log(`Updated fileSummaries, now has ${Object.keys(updated).length} entries`)
            return updated
          })

          // Update cache stats
          if (!summary.fromCache) {
            setCacheStats((prev) => ({
              ...prev,
              total: prev.total + 1,
              files: prev.files + 1,
            }))
          }
        } catch (error) {
          console.error(`Error summarizing file ${fileNode.path}:`, error)
        }

        processedItems++
        setSummarizationProgress((processedItems / totalItems) * 100)

        // Notify the popup about progress
        window.postMessage(
          {
            type: "summarization-progress",
            progress: (processedItems / totalItems) * 100,
            currentItem: fileNode.path,
            current: processedItems,
          },
          "*",
        )

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      // Process directories next
      for (const dirNode of dirNodes) {
        setCurrentSummarizingItem(dirNode.path)
        console.log(`Processing directory: ${dirNode.path}`)

        // Check if this node is marked for refresh
        const summaryKey = `${repoInfo.owner}/${repoInfo.repo}:${dirNode.path}`
        const shouldRefresh = refreshNodes[dirNode.path]

        // Skip if already summarized and not marked for refresh
        if (fileSummaries[summaryKey] && !shouldRefresh) {
          processedItems++
          setSummarizationProgress((processedItems / totalItems) * 100)

          // Notify the popup about progress
          window.postMessage(
            {
              type: "summarization-progress",
              progress: (processedItems / totalItems) * 100,
              currentItem: dirNode.path,
              current: processedItems,
            },
            "*",
          )

          continue
        }

        try {
          // Collect summaries of all children that have been summarized
          const childSummaries: { name: string; path: string; type: string; summary: string }[] = []

          // Helper function to find summarized children
          const findSummarizedChildren = (node: RepoNode) => {
            if (!node.children) return

            for (const child of node.children) {
              // Create a unique key that includes the repository information
              const childSummaryKey = `${repoInfo.owner}/${repoInfo.repo}:${child.path}`

              // If this child has a summary, add it
              if (fileSummaries[childSummaryKey]) {
                childSummaries.push({
                  name: child.name,
                  path: child.path,
                  type: child.type,
                  summary: fileSummaries[childSummaryKey].summary,
                })
              }

              // If this is a directory, check its children too
              if (child.type === "directory" && child.children) {
                findSummarizedChildren(child)
              }
            }
          }

          // Find summarized children for this directory
          findSummarizedChildren(dirNode)

          console.log(`Found ${childSummaries.length} summarized children for ${dirNode.path}`)

          // If no children have been summarized, check if we need to summarize them first
          if (childSummaries.length === 0) {
            // Look for selected file children that need to be summarized first
            const filesToSummarize: RepoNode[] = []

            const findSelectedFileChildren = (node: RepoNode) => {
              if (!node.children) return

              for (const child of node.children) {
                const childPath = child.path

                // If this is a selected file that can be summarized, add it to the list
                if (child.type === "file" && selectedNodes[childPath] && canFileBeSummarized(child.name)) {
                  filesToSummarize.push(child)
                }

                // If this is a directory, check its children too
                if (child.type === "directory" && child.children) {
                  findSelectedFileChildren(child)
                }
              }
            }

            findSelectedFileChildren(dirNode)

            // If we found files to summarize, process them first
            if (filesToSummarize.length > 0) {
              console.log(`Found ${filesToSummarize.length} files to summarize first for directory ${dirNode.path}`)

              for (const fileNode of filesToSummarize) {
                try {
                  // Fetch file content
                  const content = await fetchFileContent(
                    repoInfo.owner,
                    repoInfo.repo,
                    fileNode.path,
                    repoInfo.branch,
                    token,
                  )

                  // Generate summary
                  const apiKey = selectedProvider === "groq" ? groqApiKey : openaiApiKey
                  if (!apiKey) {
                    throw new Error(`${selectedProvider} API key is required for summarization`)
                  }

                  const summary = await summarizeFile(
                    content,
                    fileNode.name,
                    apiKey,
                    selectedProvider,
                    repoInfo.owner,
                    repoInfo.repo,
                    fileNode.path,
                    refreshNodes[fileNode.path],
                  )

                  // Store in fileSummaries state
                  const fileSummaryKey = `${repoInfo.owner}/${repoInfo.repo}:${fileNode.path}`
                  setFileSummaries((prev) => ({
                    ...prev,
                    [fileSummaryKey]: summary,
                  }))

                  // Add to childSummaries for directory summarization
                  childSummaries.push({
                    name: fileNode.name,
                    path: fileNode.path,
                    type: "file",
                    summary: summary.summary,
                  })
                } catch (error) {
                  console.error(`Error summarizing file ${fileNode.path}:`, error)
                }

                // Small delay to avoid rate limiting
                await new Promise((resolve) => setTimeout(resolve, 500))
              }
            }
          }

          // If we still have no summarized children, skip this directory
          if (childSummaries.length === 0) {
            console.warn(`No summarized children found for directory ${dirNode.path}. Skipping.`)
            processedItems++
            setSummarizationProgress((processedItems / totalItems) * 100)
            continue
          }

          // Generate the directory summary
          const apiKey = selectedProvider === "groq" ? groqApiKey : openaiApiKey
          if (!apiKey) {
            console.error(`No API key provided for ${selectedProvider}`)
            throw new Error(`${selectedProvider} API key is required for summarization`)
          }

          console.log(
            `Summarizing directory ${dirNode.path} with ${selectedProvider}${shouldRefresh ? " (refresh)" : ""}`,
          )
          const summary = await summarizeDirectory(
            dirNode.name,
            dirNode.path,
            childSummaries,
            apiKey,
            selectedProvider,
            repoInfo.owner,
            repoInfo.repo,
            shouldRefresh, // Force refresh if marked
          )

          console.log(`Summary generated for directory ${dirNode.path}: ${summary.summary.substring(0, 50)}...`)

          // Store in fileSummaries state
          setFileSummaries((prev) => {
            const updated = {
              ...prev,
              [summaryKey]: summary,
            }
            console.log(`Updated fileSummaries, now has ${Object.keys(updated).length} entries`)
            return updated
          })

          // Update cache stats if this is a new summary
          if (!summary.fromCache) {
            setCacheStats((prev) => ({
              ...prev,
              total: prev.total + 1,
              directories: prev.directories + 1,
            }))
          }
        } catch (error) {
          console.error(`Error summarizing directory ${dirNode.path}:`, error)
        }

        processedItems++
        setSummarizationProgress((processedItems / totalItems) * 100)

        // Notify the popup about progress
        window.postMessage(
          {
            type: "summarization-progress",
            progress: (processedItems / totalItems) * 100,
            currentItem: dirNode.path,
            current: processedItems,
          },
          "*",
        )

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      console.log("Batch summarization complete, forcing visualization update")

      // Force a re-render of the visualization to show updated summaries
      if (repoData && activeTab === "visualization") {
        const filteredData = filterRepoTree(repoData, filterText)
        if (filteredData) {
          // Set a small timeout to ensure state updates have propagated
          setTimeout(() => {
            renderVisualization(filteredData)
          }, 500)
        }
      }
    } catch (error) {
      console.error("Error during batch summarization:", error)
      throw error
    } finally {
      setIsBatchSummarizing(false)
      setCurrentSummarizingItem(null)
      setSummarizationProgress(0)
    }
  }

  // Add this function inside the component, after the fetchRepoData function
  // Update the navigateToChat function to save all necessary state
  const navigateToChat = () => {
    // Store necessary data in localStorage before navigating
    localStorage.setItem("repoId", repoId)

    if (token) {
      localStorage.setItem("githubToken", token)
    }

    if (repoInfo) {
      localStorage.setItem("repoInfo", JSON.stringify(repoInfo))
    }

    localStorage.setItem("apiProvider", selectedProvider)

    if (selectedProvider === "groq" && groqApiKey) {
      localStorage.setItem("groqApiKey", groqApiKey)
    }

    if (selectedProvider === "openai" && openaiApiKey) {
      localStorage.setItem("openaiApiKey", openaiApiKey)
    }

    // Navigate to chat page
    router.push("/chat")
  }

  // Function to download the repository
  const downloadRepository = () => {
    if (!repoInfo) return

    const { owner, repo, branch } = repoInfo
    const downloadUrl = getRepoDownloadUrl(owner, repo, branch)

    // Create a temporary anchor element to trigger the download
    const a = document.createElement("a")
    a.href = downloadUrl
    a.download = `${repo}.zip`
    a.target = "_blank"
    a.rel = "noopener noreferrer"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // Function to load commit history
  const loadCommitHistory = async () => {
    if (!repoId && !repoInfo) return

    setIsLoadingCommits(true)
    setCommits([]) // Clear previous commits
    setCommitError(null) // Clear previous errors

    try {
      let owner, repo

      if (repoInfo) {
        // Use repoInfo if available
        owner = repoInfo.owner
        repo = repoInfo.repo
      } else {
        // Otherwise parse from repoId
        const parts = repoId.split("/")
        if (parts.length !== 2) {
          throw new Error("Invalid repository format")
        }
        ;[owner, repo] = parts
      }

      const commitData = await fetchCommitHistory(owner, repo, token)
      setCommits(commitData)
    } catch (err) {
      console.error("Failed to fetch commit history:", err)
      setCommitError(err instanceof Error ? err.message : "Failed to fetch commit history")
    } finally {
      setIsLoadingCommits(false)
    }
  }

  // New function to load cached summaries
  const loadCachedRepoSummaries = async (owner: string, repo: string) => {
    setIsLoadingCache(true)
    try {
      // Load cached summaries
      const summaries = await loadCachedSummaries(owner, repo)

      // Count file and directory summaries
      let fileCount = 0
      let dirCount = 0

      Object.keys(summaries).forEach((key) => {
        // The key format is owner/repo:path
        // Check if the key ends with :file or :directory
        if (key.endsWith(":file")) {
          fileCount++
        } else if (key.endsWith(":directory")) {
          dirCount++
        }
      })

      // Update cache stats
      setCacheStats({
        total: Object.keys(summaries).length,
        files: fileCount,
        directories: dirCount,
      })

      // Load summarized children counts
      const childrenCounts = await loadSummarizedChildrenCounts(owner, repo)

      // Update state
      setFileSummaries(summaries)
      setSummarizedChildrenCount(childrenCounts)

      return summaries
    } catch (error) {
      console.error("Failed to load cached summaries:", error)
      return {}
    } finally {
      setIsLoadingCache(false)
    }
  }

  // Fetch GitHub repository data
  // Modify the fetchRepoData function to accept a parameter indicating if it's being called on initial load
  const fetchRepoData = async (isInitialLoad = false) => {
    // If this is an initial load and we're already loading data from localStorage, return
    if (isInitialLoad && isLoading) return

    // If this is not an initial load or there's no repoId, return
    if (!repoId.trim() && !isInitialLoad) return

    setIsLoading(true)
    setError(null)

    // Only clear these states if we're not loading from saved state
    // Modify the fetchRepoData function to reset the shownChangesTimestamp when loading a new repository
    // Find this section in the fetchRepoData function where states are cleared:
    if (!isInitialLoad) {
      setRepoData(null)
      setSelectedNode(null)
      setFilterText("")
      setCollapsedNodes(new Set())
      setCommits([])
      setCommitError(null)
      setRepoInfo(null)
      setFileSummary(null)
      setCacheStats({ total: 0, files: 0, directories: 0 })
      // Clear all summaries when loading a new repository
      setFileSummaries({})
      setSummarizedChildrenCount({})
      // Reset the shown changes timestamp
      setShownChangesTimestamp(null)
    }

    try {
      // If this is an initial load and we have repoInfo, use that
      let owner, repo, defaultBranch

      if (isInitialLoad && repoInfo) {
        owner = repoInfo.owner
        repo = repoInfo.repo
        defaultBranch = repoInfo.branch
      } else {
        // Format: username/repo
        const parts = repoId.split("/")
        if (parts.length !== 2) {
          throw new Error('Invalid repository format. Use "username/repo"')
        }
        ;[owner, repo] = parts

        // Prepare headers for API request
        const headers = new Headers()
        headers.append("Accept", "application/vnd.github.v3+json")

        // Add token to headers if provided
        if (token.trim()) {
          headers.append("Authorization", `token ${token.trim()}`)
        }

        // Get repository info to determine the default branch
        const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })

        if (!repoResponse.ok) {
          throw new Error(`Failed to fetch repository: ${repoResponse.statusText}`)
        }

        const repoInfoData = await repoResponse.json()
        defaultBranch = repoInfoData.default_branch

        // Store repo info for download functionality
        setRepoInfo({ owner, repo, branch: defaultBranch })

        // Save to localStorage
        localStorage.setItem("repoInfo", JSON.stringify({ owner, repo, branch: defaultBranch }))
        localStorage.setItem("repoId", repoId)
      }

      // Load cached summaries for this repository
      await loadCachedRepoSummaries(owner, repo)

      // Prepare headers for API request
      const headers = new Headers()
      headers.append("Accept", "application/vnd.github.v3+json")

      // Add token to headers if provided
      if (token.trim()) {
        headers.append("Authorization", `token ${token.trim()}`)
      }

      // Fetch root contents
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, {
        headers: headers,
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch repository: ${response.statusText}`)
      }

      const contents = await response.json()

      // Build the hierarchical structure
      const root: RepoNode = {
        name: repo,
        type: "directory",
        path: "",
        children: [],
        url: `https://github.com/${owner}/${repo}`,
        stats: {
          files: 0,
          directories: 0,
        },
      }

      // Process initial files and directories
      await Promise.all(
        contents.map((item: any) => processItem(item, root.children as RepoNode[], owner, repo, defaultBranch)),
      )

      // Calculate directory stats (recursive)

      // Update the code that detects changes and shows the popup
      let hasChanges = false
      if (previousRepoData && previousRepoInfo) {
        // Only compare repositories if they are the SAME repository (same owner AND repo)
        if (previousRepoInfo.owner === owner && previousRepoInfo.repo === repo) {
          console.log("Same repository detected, checking for changes...")
          // After processing is complete, detect changes
          const changes = detectRepoChanges(root, previousRepoData, fileSummaries, owner, repo)

          if (changes.length > 0) {
            console.log(`Detected ${changes.length} changes in repository`)
            setRepoChanges(changes)

            // Add new changes to pendingUpdates
            const newPendingUpdates = { ...pendingUpdates }
            changes.forEach((change) => {
              if (change.type === "added" || change.type === "updated") {
                const key = `${owner}/${repo}:${change.node.path}`
                newPendingUpdates[key] = change.node
              }
            })

            // Save to state and localStorage
            setPendingUpdates(newPendingUpdates)
            localStorage.setItem("pendingUpdates", JSON.stringify(newPendingUpdates))

            // Show changes popup
            setShowChangesPopup(true)
            hasChanges = true
          } else if (Object.keys(pendingUpdates).length > 0) {
            // If there are pending updates, show the popup even if no new changes
            console.log("No new changes detected, but there are pending updates")
            setShowChangesPopup(true)
            hasChanges = true
          }
        } else {
          // Different repository, don't show changes popup
          console.log("Different repository detected, not showing changes popup")
          setRepoChanges([])
          setShowChangesPopup(false)

          // Different repository, so clear pending updates for the previous repository
          setPendingUpdates({})
          localStorage.removeItem("pendingUpdates")

          // Update previous data with the new repository
          setPreviousRepoData(root)
          setPreviousRepoInfo({ owner, repo, branch: defaultBranch })
        }
      } else {
        // No previous data, so update it
        console.log("No previous repo data, setting it now")
        setPreviousRepoData(root)
        setPreviousRepoInfo({ owner, repo, branch: defaultBranch })
      }

      // Only update previous data if there are no changes and it's the same repository
      if (!hasChanges && previousRepoInfo && previousRepoInfo.owner === owner && previousRepoInfo.repo === repo) {
        console.log("No changes detected, updating previous repo data")
        setPreviousRepoData(root)
        setPreviousRepoInfo({ owner, repo, branch: defaultBranch })
      }

      calculateDirectoryStats(root)

      // Set flag to trigger animation on new data
      isNewDataRef.current = true
      isFirstRenderRef.current = true

      setRepoData(root)
      setActiveTab("visualization")

      // Automatically load commit history for the new repository
      if (!error) {
        loadCommitHistory()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch repository data")
    } finally {
      setIsLoading(false)
    }
  }

  // Reset summary when selecting a new node
  useEffect(() => {
    setFileSummary(null)
    setSummaryError(null)
    setDirectorySummaryError(null)

    // If a node is selected and we have cached summaries, show them
    if (selectedNode && repoInfo) {
      const summaryKey = `${repoInfo.owner}/${repoInfo.repo}:${selectedNode.path}`
      if (fileSummaries[summaryKey]) {
        setFileSummary(fileSummaries[summaryKey])
      }
    }
  }, [selectedNode, repoInfo, fileSummaries])

  // Process a repository item (file or directory)
  const processItem = async (
    item: any,
    parentChildren: RepoNode[],
    owner: string,
    repo: string,
    branch: string,
    depth = 0,
  ) => {
    const maxDepth = token.trim() ? 100 : 2 // Higher depth limit when using token

    const node: RepoNode = {
      name: item.name,
      type: item.type === "dir" ? "directory" : "file",
      path: item.path,
      url:
        item.html_url ||
        `https://github.com/${owner}/${repo}/${item.type === "dir" ? "tree" : "blob"}/${branch}/${item.path}`,
      size: item.size || 0,
    }

    parentChildren.push(node)

    if (item.type === "dir" && depth < maxDepth) {
      node.children = []
      node.stats = { files: 0, directories: 0 }

      try {
        // Prepare headers for API request
        const headers = new Headers()
        headers.append("Accept", "application/vnd.github.v3+json")

        // Add token to headers if provided
        if (token.trim()) {
          headers.append("Authorization", `token ${token.trim()}`)
        }

        const response = await fetch(item.url, {
          headers: headers,
        })

        if (response.ok) {
          const contents = await response.json()
          await Promise.all(
            contents.map((childItem: any) =>
              processItem(childItem, node.children as RepoNode[], owner, repo, branch, depth + 1),
            ),
          )
        }
      } catch (err) {
        console.error(`Failed to fetch directory contents for ${item.path}:`, err)
      }
    }

    return node
  }

  // Calculate directory statistics recursively
  const calculateDirectoryStats = (node: RepoNode) => {
    if (node.type === "directory" && node.children) {
      let files = 0
      let directories = 0

      if (node.children.length > 0) {
        for (const child of node.children) {
          if (child.type === "directory") {
            calculateDirectoryStats(child)
            directories++

            // Add child stats to parent
            if (child.stats) {
              files += child.stats.files
              directories += child.stats.directories
            }
          } else {
            files++
          }
        }
      }

      node.stats = { files, directories }
    }
  }

  // Function to handle node collapse/expand based on double-click
  const toggleNodeCollapse = (node: HierarchyNode) => {
    const nodePath = node.data.path || node.data.name

    // When collapsing/expanding nodes, we don't want to trigger the animation
    isNewDataRef.current = false
    isFirstRenderRef.current = false

    setCollapsedNodes((prevCollapsed) => {
      const newCollapsed = new Set(prevCollapsed)
      if (newCollapsed.has(nodePath)) {
        newCollapsed.delete(nodePath) // Expand
      } else {
        newCollapsed.add(nodePath) // Collapse
      }
      return newCollapsed
    })
  }

  // Recursively filter repository tree based on the filter text
  const filterRepoTree = (node: RepoNode, filter: string): RepoNode | null => {
    if (!filter.trim()) return node // no filtering

    const match = node.name.toLowerCase().includes(filter.toLowerCase())

    if (node.children) {
      const filteredChildren = node.children
        .map((child) => filterRepoTree(child, filter))
        .filter((child): child is RepoNode => child !== null)

      if (match || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren }
      }
      return null
    } else {
      return match ? node : null
    }
  }

  // Process tree data with collapsed nodes for D3 visualization
  const processTreeWithCollapsedNodes = (data: RepoNode): RepoNode => {
    // Create a deep copy to avoid modifying the original data
    const processNode = (node: RepoNode): RepoNode => {
      const nodeCopy = { ...node }

      if (nodeCopy.children) {
        // Check if this node is collapsed
        const nodePath = nodeCopy.path || nodeCopy.name
        if (collapsedNodes.has(nodePath)) {
          // Store children but don't display them
          nodeCopy._children = nodeCopy.children.map((child) => processNode(child))
          delete nodeCopy.children
        } else {
          // Node is expanded, process its children
          nodeCopy.children = nodeCopy.children.map((child) => processNode(child))
        }
      }

      return nodeCopy
    }

    return processNode(data)
  }

  // Render the D3 visualization using the given data
  const renderVisualization = (data: RepoNode) => {
    if (!svgRef.current || !data) return

    // Clear previous visualization
    d3.select(svgRef.current).selectAll("*").remove()

    // Apply collapsed state to the data
    const processedData = processTreeWithCollapsedNodes(data)

    const width = 800
    const height = 600
    const margin = { top: 20, right: 90, bottom: 30, left: 90 }

    // Create a tree layout
    const treeLayout = tree<RepoNode>().size([height - margin.top - margin.bottom, width - margin.right - margin.left])

    // Convert the data to D3 hierarchy
    const root = hierarchy(processedData)

    // Assign positions to nodes
    const treeData = treeLayout(root)

    // Create the SVG container
    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`)

    d3.select(svgRef.current).call(
      zoom()
        .scaleExtent([0.5, 5])
        .on("zoom", (event) => {
          svg.attr("transform", event.transform)
        }) as any,
    )

    // Create links between nodes with conditional animation
    // Only apply animation class if this is the first render after loading new data
    const links = svg
      .selectAll(".repo-link")
      .data(treeData.links())
      .enter()
      .append("path")
      .attr("class", isFirstRenderRef.current ? "link" : "repo-link")
      .attr(
        "d",
        linkHorizontal<any, any>()
          .x((d) => d.y)
          .y((d) => d.x),
      )
      .attr("fill", "none")
      .attr("stroke", "currentColor")
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", 1.5)

    // After first render, disable animation for subsequent renders
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
    }

    // Create node groups
    const nodes = svg
      .selectAll(".node")
      .data(treeData.descendants())
      .enter()
      .append("g")
      .attr("class", (d) => {
        // Add a class to identify collapsed nodes
        const hasChildren = d.data.children || d.data._children
        const isCollapsed = d.data._children ? "node-collapsed" : ""
        return `node ${d.data.children ? "node-branch" : "node-leaf"} ${isCollapsed}`
      })
      .attr("transform", (d) => `translate(${d.y},${d.x})`)
      .on("click", (event, d) => {
        setSelectedNode(d.data)
      })
      .on("dblclick", (event, d) => {
        // Only allow toggle for nodes that have children
        if (d.data.children || d.data._children) {
          toggleNodeCollapse(d as HierarchyNode)
        }
        // Prevent the click event from also firing
        event.stopPropagation()
      })

    // Add a special indicator for nodes that have been summarized
    nodes
      .filter((d) => {
        if (!repoInfo) return false
        const summaryKey = `${repoInfo.owner}/${repoInfo.repo}:${d.data.path}`
        return fileSummaries[summaryKey]
      })
      .append("circle")
      .attr("r", 12)
      .attr("fill", "none")
      .attr("stroke", (d) => {
        if (!repoInfo) return "#8b5cf6"
        const summaryKey = `${repoInfo.owner}/${repoInfo.repo}:${d.data.path}`
        return d.data.type === "directory" ? "#8b5cf6" : "#10b981"
      })
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "2,2") // Always use dashed/radiating circle for all summarized nodes
      .attr("opacity", 0.8)
      .attr("class", "radiating-circle") // Add this class for animation

    // Add circles for nodes
    nodes
      .append("circle")
      .attr("r", 8)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .attr("fill", (d) => {
        // Use different colors for summarizable and non-summarizable files
        if (d.data.type === "file" && !canFileBeSummarized(d.data.name)) {
          return "#9ca3af" // Gray for non-summarizable files
        }
        return d.data.type === "directory" ? "#8b5cf6" : "#10b981" // Default colors
      })

    // Add collapse/expand indicator for nodes with children
    nodes
      .filter((d) => d.data.children || d.data._children)
      .append("text")
      .attr("dy", 3)
      .attr("x", 0)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .style("fill", "white")
      .text((d) => (d.data._children ? "+" : d.data.children && d.data.children.length > 0 ? "-" : ""))

    // Add labels to nodes
    nodes
      .append("text")
      .attr("dy", ".31em")
      .attr("x", (d) => (d.children ? -13 : 13))
      .attr("text-anchor", (d) => (d.children ? "end" : "start"))
      .text((d) => {
        const name = d.data.name
        return name.length > 20 ? name.substring(0, 17) + "..." : name
      })
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .attr("fill", "currentColor")
      .attr("stroke", "var(--background)")
      .attr("stroke-width", "0.5px")

    // Add tooltip for node info on hover
    nodes.append("title").text((d) => {
      const name = d.data.name
      const type = d.data.type === "file" ? "File" : "Directory"
      const hasChildren = d.data.children || d.data._children
      const childCount = hasChildren
        ? d.data.children
          ? d.data.children.length
          : d.data._children
            ? d.data._children.length
            : 0
        : 0

      // Check if this node has a cached summary
      let cachedInfo = ""
      if (repoInfo) {
        const summaryKey = `${repoInfo.owner}/${repoInfo.repo}:${d.data.path}`
        if (fileSummaries[summaryKey]?.fromCache) {
          cachedInfo = "\n(Cached summary available)"
        } else if (fileSummaries[summaryKey]) {
          cachedInfo = "\n(Summary available)"
        }
      }

      // Add information about summarizability for files
      let summarizableInfo = ""
      if (d.data.type === "file") {
        summarizableInfo = canFileBeSummarized(d.data.name) ? "\n(Can be summarized)" : "\n(Cannot be summarized)"
      }

      return `${name} (${type})${cachedInfo}${summarizableInfo}\n${hasChildren ? `Contains: ${childCount} items` : ""}${d.data._children ? "\nDouble-click to expand" : hasChildren ? "\nDouble-click to collapse" : ""}`
    })
  }

  // Update the visualization when either the repository data, filter text, or collapsed nodes change
  useEffect(() => {
    if (repoData && activeTab === "visualization") {
      const filteredData = filterRepoTree(repoData, filterText)
      if (filteredData) {
        renderVisualization(filteredData)
      } else {
        // Clear visualization if no nodes match filter
        d3.select(svgRef.current).selectAll("*").remove()
      }
    }
  }, [filterText, repoData, collapsedNodes, activeTab, fileSummaries])

  // This effect ensures the visualization is re-rendered when switching back to the visualization tab
  // but we don't want to trigger the animation when switching tabs
  useEffect(() => {
    if (activeTab === "visualization" && repoData) {
      // When switching tabs, we don't want to trigger the animation
      isFirstRenderRef.current = false

      const filteredData = filterRepoTree(repoData, filterText)
      if (filteredData) {
        // Small timeout to ensure the DOM is ready after tab switch
        setTimeout(() => {
          renderVisualization(filteredData)
        }, 50)
      }
    }
  }, [activeTab])

  // Format file size for display
  const formatFileSize = (bytes?: number) => {
    if (bytes === undefined || bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  // Find the handleSubmit function (should be near the end of the file)
  // Update it to reset both previousRepoData and previousRepoInfo

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Reset previous repo data to ensure changes are detected
    setPreviousRepoData(null)
    setPreviousRepoInfo(null)
    // Clear pending updates when switching repositories
    setPendingUpdates({})
    localStorage.removeItem("pendingUpdates")
    fetchRepoData()
  }

  return (
    <div className="flex flex-col w-full space-y-6">
      <Card className="overflow-hidden border-0 shadow-lg dark:bg-gray-800/50 backdrop-blur-sm">
        <CardContent className="p-0">
          <form onSubmit={handleSubmit} className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Github className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
                <Input
                  type="text"
                  value={repoId}
                  onChange={(e) => setRepoId(e.target.value)}
                  placeholder="Enter repository (username/repo)"
                  className="pl-10 h-12 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              </div>
              <div className="flex gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowTokenInput(!showTokenInput)}
                        className="h-12 px-4 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        {showTokenInput ? <EyeOff className="h-5 w-5" /> : <Key className="h-5 w-5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {showTokenInput ? "Hide GitHub token input" : "Use GitHub token for higher API limits"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowGroqKeyInput(!showGroqKeyInput)}
                        className="h-12 px-4 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        {showGroqKeyInput ? <EyeOff className="h-5 w-5" /> : <Brain className="h-5 w-5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {showGroqKeyInput ? "Hide Groq API key input" : "Use Groq API key for file summarization"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowOpenaiKeyInput(!showOpenaiKeyInput)}
                        className="h-12 px-4 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        {showOpenaiKeyInput ? <EyeOff className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {showOpenaiKeyInput ? "Hide OpenAI API key input" : "Use OpenAI API key for file summarization"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="h-12 px-6 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-md hover:shadow-lg transition-all duration-200"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-5 w-5" />
                    Visualize
                  </>
                )}
              </Button>
            </div>

            {showTokenInput && (
              <div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <div className="relative flex-1">
                    <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <Input
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="Enter GitHub personal access token (optional)"
                      className="pl-10 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                    />
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                    <Info className="h-3 w-3 mr-1" />
                    For higher API rate limits
                  </div>
                </div>
              </div>
            )}

            {showGroqKeyInput && (
              <div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <div className="relative flex-1">
                    <Brain className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <Input
                      type="password"
                      value={groqApiKey}
                      onChange={(e) => setGroqApiKey(e.target.value)}
                      placeholder="Enter Groq API key (for file summarization)"
                      className="pl-10 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                    />
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                    <Info className="h-3 w-3 mr-1" />
                    Required for file summarization with Groq
                  </div>
                </div>
              </div>
            )}

            {showOpenaiKeyInput && (
              <div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <div className="relative flex-1">
                    <Sparkles className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <Input
                      type="password"
                      value={openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      placeholder="Enter OpenAI API key (for file summarization)"
                      className="pl-10 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                    />
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                    <Info className="h-3 w-3 mr-1" />
                    Required for file summarization with OpenAI
                  </div>
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="border-0 shadow-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {repoData && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-col md:flex-row gap-4 items-center mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <Input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter files by name..."
                className="pl-10 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              />
            </div>

            <div className="flex items-center gap-2">
              <TabsList className="grid w-full md:w-auto grid-cols-6 p-1 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl">
                <TabsTrigger
                  value="visualization"
                  className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm rounded-lg transition-all duration-200"
                >
                  <FolderTree className="h-4 w-4" />
                  <span className="hidden sm:inline">Visualization</span>
                </TabsTrigger>
                <TabsTrigger
                  value="details"
                  className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm rounded-lg transition-all duration-200"
                >
                  <Code className="h-4 w-4" />
                  <span className="hidden sm:inline">Details</span>
                </TabsTrigger>
                <TabsTrigger
                  value="summary"
                  className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm rounded-lg transition-all duration-200"
                >
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">Summary</span>
                </TabsTrigger>
                <TabsTrigger
                  value="sizes"
                  className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm rounded-lg transition-all duration-200"
                >
                  <BarChart className="h-4 w-4" />
                  <span className="hidden sm:inline">File Sizes</span>
                </TabsTrigger>
                <TabsTrigger
                  value="commits"
                  className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm rounded-lg transition-all duration-200"
                >
                  <GitCommit className="h-4 w-4" />
                  <span className="hidden sm:inline">Commits</span>
                </TabsTrigger>
                <TabsTrigger
                  value="compare"
                  className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm rounded-lg transition-all duration-200"
                >
                  <Split className="h-4 w-4" />
                  <span className="hidden sm:inline">Compare</span>
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="text-xs px-3 py-2 rounded-full bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 inline-flex items-center">
              <Info className="h-3 w-3 mr-1.5" />
              Double-click on folder nodes to collapse/expand their children
            </div>

            {repoInfo && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsTreePopupOpen(true)}
                  className="flex items-center gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Batch Summarize
                </Button>
                {cacheStats.total > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300 border-violet-200 dark:border-violet-800 flex items-center gap-1"
                  >
                    <Database className="h-3 w-3" />
                    {cacheStats.total} cached summaries
                  </Badge>
                )}
                <Button variant="outline" size="sm" onClick={downloadRepository} className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Download Repository
                </Button>

                {/* Add this new button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={navigateToChat}
                  className="flex items-center gap-2"
                  disabled={Object.keys(fileSummaries).length === 0}
                >
                  <MessageSquare className="h-4 w-4" />
                  Open Chat
                </Button>
              </div>
            )}
          </div>

          <TabsContent value="visualization" className="mt-0">
            <Card className="overflow-hidden border-0 shadow-lg h-[600px] dark:bg-gray-800/30 backdrop-blur-sm card-hover-effect">
              <CardContent className="p-0 h-full">
                <div className="visualization-bg h-full w-full overflow-hidden">
                  {isLoading ? (
                    <div className="h-full w-full flex items-center justify-center">
                      <div className="space-y-6 flex flex-col items-center">
                        <Loader2 className="h-10 w-10 text-violet-500 animate-spin" />
                        <p className="text-gray-500 dark:text-gray-400 animate-pulse-slow">
                          Loading repository structure...
                        </p>
                      </div>
                    </div>
                  ) : (
                    <svg ref={svgRef} className="w-full h-full"></svg>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details" className="mt-0">
            <Card className="overflow-hidden border-0 shadow-lg dark:bg-gray-800/30 backdrop-blur-sm">
              <CardContent>
                {selectedNode ? (
                  <div className="space-y-4">
                    <h2 className="text-xl font-semibold">{selectedNode.name}</h2>
                    <p>
                      <strong>Type:</strong> {selectedNode.type}
                    </p>
                    <p>
                      <strong>Path:</strong> {selectedNode.path}
                    </p>
                    <p>
                      <strong>URL:</strong>{" "}
                      <a
                        href={selectedNode.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline flex items-center gap-1"
                      >
                        View on GitHub <ExternalLink className="h-4 w-4" />
                      </a>
                    </p>
                    {selectedNode.type === "file" && (
                      <p>
                        <strong>Size:</strong> {formatFileSize(selectedNode.size)}
                      </p>
                    )}
                    {selectedNode.type === "directory" && selectedNode.stats && (
                      <>
                        <p>
                          <strong>Files:</strong> {selectedNode.stats.files}
                        </p>
                        <p>
                          <strong>Directories:</strong> {selectedNode.stats.directories}
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">Select a node to view details.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="summary" className="mt-0">
            <Card className="overflow-hidden border-0 shadow-lg dark:bg-gray-800/30 backdrop-blur-sm">
              <CardContent>
                {selectedNode ? (
                  <div className="space-y-4">
                    <h2 className="text-xl font-semibold">
                      {selectedNode.type === "directory" ? "Directory Summary" : "File Summary"}
                    </h2>

                    {selectedNode.type === "directory" && summarizedChildrenCount[getSummaryKey(selectedNode)!] > 0 && (
                      <p className="text-gray-500 dark:text-gray-400">
                        {summarizedChildrenCount[getSummaryKey(selectedNode)!]} summarized children
                      </p>
                    )}

                    {fileSummary ? (
                      <>
                        <p className="text-gray-500 dark:text-gray-400">
                          {fileSummary.fromCache ? "Loaded from cache" : "Generated on demand"}
                        </p>
                        <p>{fileSummary.summary}</p>
                      </>
                    ) : (
                      <>
                        {selectedNode.type === "file" && canFileBeSummarized(selectedNode.name) && (
                          <>
                            <p className="text-gray-500 dark:text-gray-400">No summary available.</p>
                            <Button
                              variant="outline"
                              disabled={isSummarizing}
                              onClick={() => generateSummary()}
                              className="bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 text-white"
                            >
                              {isSummarizing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Brain className="mr-2 h-4 w-4" />
                                  Generate Summary
                                </>
                              )}
                            </Button>
                            {summaryError && (
                              <Alert variant="destructive" className="mt-4">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{summaryError}</AlertDescription>
                              </Alert>
                            )}
                          </>
                        )}

                        {selectedNode.type === "directory" && (
                          <>
                            <p className="text-gray-500 dark:text-gray-400">No directory summary available.</p>
                            <Button
                              variant="outline"
                              disabled={isSummarizingDirectory}
                              onClick={() => generateDirectorySummary()}
                              className="bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 text-white"
                            >
                              {isSummarizingDirectory ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Brain className="mr-2 h-4 w-4" />
                                  Generate Directory Summary
                                </>
                              )}
                            </Button>
                            {directorySummaryError && (
                              <Alert variant="destructive" className="mt-4">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{directorySummaryError}</AlertDescription>
                              </Alert>
                            )}
                          </>
                        )}

                        {selectedNode.type === "file" && !canFileBeSummarized(selectedNode.name) && (
                          <Alert variant="warning" className="mt-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>This file type cannot be summarized.</AlertDescription>
                          </Alert>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">Select a file or directory to view its summary.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sizes" className="mt-0">
            <Card className="overflow-hidden border-0 shadow-lg dark:bg-gray-800/30 backdrop-blur-sm">
              <CardContent>
                {repoData ? (
                  <FileSizeDistribution repoData={repoData} />
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">No repository data to display.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="commits" className="mt-0">
            <Card className="overflow-hidden border-0 shadow-lg dark:bg-gray-800/30 backdrop-blur-sm">
              <CardContent>
                {isLoadingCommits ? (
                  <div className="flex justify-center items-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-500 dark:text-gray-400" />
                  </div>
                ) : commitError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{commitError}</AlertDescription>
                  </Alert>
                ) : commits.length > 0 ? (
                  <CommitHistory commits={commits} />
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">No commits to display.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compare" className="mt-0">
            <Card className="overflow-hidden border-0 shadow-lg dark:bg-gray-800/30 backdrop-blur-sm">
              <CardContent>
                <RepoComparison />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <DirectoryTreePopup
        isOpen={isTreePopupOpen}
        onClose={() => setIsTreePopupOpen(false)}
        repoData={repoData}
        onSummarize={handleBatchSummarize}
        isSummarizing={isBatchSummarizing}
        summarizationProgress={summarizationProgress}
        currentSummarizingItem={currentSummarizingItem}
      />

      {/* Repository Changes Popup */}
      {showChangesPopup && (
        <RepoChangesPopup
          isOpen={showChangesPopup}
          onClose={() => {
            setShowChangesPopup(false)
            // Record that we've shown changes for this repository
            setShownChangesTimestamp(Date.now())
          }}
          changes={repoChanges}
          pendingUpdates={Object.values(pendingUpdates).map((node) => ({ type: "updated" as const, node }))}
          onUpdateSummaries={handleUpdateSummaries}
          onSkipUpdates={() => {
            // Just close the popup, no summary updates
            console.log("Skipping summary updates for changed files")
            // Do NOT record that we've shown changes when skipping
            setShowChangesPopup(false)
            // Reset previous repo data to null so changes will be detected again next time
            setPreviousRepoData(null)
            setPreviousRepoInfo(null)
          }}
        />
      )}
    </div>
  )
}
