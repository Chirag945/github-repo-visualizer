"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { ChevronRight, ChevronDown, File, Folder, Database, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { canFileBeSummarized } from "@/lib/file-utils"
import type { FileSummary } from "@/app/actions"

interface RepoNode {
  name: string
  type: "file" | "directory"
  path: string
  url: string
  size?: number
  children?: RepoNode[]
}

interface DirectoryTreePopupProps {
  isOpen: boolean
  onClose: () => void
  repoData: RepoNode | null
  repoInfo: { owner: string; repo: string; branch: string } | null
  fileSummaries: Record<string, FileSummary>
  onSummarize: (selectedNodes: Record<string, boolean>, refreshNodes: Record<string, boolean>) => Promise<void>
  apiProvider: "groq" | "openai"
  apiKey: string
}

export default function DirectoryTreePopup({
  isOpen,
  onClose,
  repoData,
  repoInfo,
  fileSummaries,
  onSummarize,
  apiProvider,
  apiKey,
}: DirectoryTreePopupProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedNodes, setSelectedNodes] = useState<Record<string, boolean>>({})
  const [refreshNodes, setRefreshNodes] = useState<Record<string, boolean>>({})
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentItem, setCurrentItem] = useState<string | null>(null)
  const [processedCount, setProcessedCount] = useState({ current: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [showRefreshOptions, setShowRefreshOptions] = useState(false)

  // Reset state when the popup opens
  useEffect(() => {
    if (isOpen) {
      setExpandedNodes(new Set([""])) // Expand root by default
      setSelectedNodes({})
      setRefreshNodes({})
      setIsSummarizing(false)
      setProgress(0)
      setCurrentItem(null)
      setProcessedCount({ current: 0, total: 0 })
      setError(null)
      setShowRefreshOptions(false)
    }
  }, [isOpen])

  // Helper function to get the summary key for a node
  const getSummaryKey = (node: RepoNode): string | null => {
    if (!repoInfo) return null
    return `${repoInfo.owner}/${repoInfo.repo}:${node.path}`
  }

  // Check if a node has been summarized
  const isNodeSummarized = (node: RepoNode): boolean => {
    const summaryKey = getSummaryKey(node)
    return summaryKey ? !!fileSummaries[summaryKey] : false
  }

  // Check if a directory has any summarized children
  const hasSummarizedChildren = (node: RepoNode): boolean => {
    if (node.type !== "directory" || !node.children) return false

    return node.children.some((child) => {
      const childSummaryKey = getSummaryKey(child)
      if (childSummaryKey && fileSummaries[childSummaryKey]) return true
      if (child.type === "directory" && child.children) return hasSummarizedChildren(child)
      return false
    })
  }

  // Check if a directory has any newly selected children
  const hasNewlySelectedChildren = (node: RepoNode): boolean => {
    if (node.type !== "directory" || !node.children) return false

    return node.children.some((child) => {
      const childPath = child.path
      if (selectedNodes[childPath] && !isNodeSummarized(child)) return true
      if (child.type === "directory" && child.children) return hasNewlySelectedChildren(child)
      return false
    })
  }

  // Toggle node expansion
  const toggleNodeExpansion = (path: string) => {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }
      return newSet
    })
  }

  // Handle node selection
  const handleNodeSelection = (node: RepoNode, checked: boolean) => {
    const nodePath = node.path

    // If refresh mode is on, we can select already summarized nodes
    if (showRefreshOptions) {
      // Update selected nodes
      setSelectedNodes((prev) => ({
        ...prev,
        [nodePath]: checked,
      }))

      // Mark for refresh if it's already summarized
      if (isNodeSummarized(node)) {
        setRefreshNodes((prev) => ({
          ...prev,
          [nodePath]: checked,
        }))
      }

      // If it's a directory, we might want to select/deselect children too
      if (node.type === "directory" && node.children) {
        // Optional: Add recursive selection of children
        // This is commented out as it might not be desired behavior
        /*
        const selectChildren = (parentNode: RepoNode, isSelected: boolean) => {
          if (!parentNode.children) return;
          
          for (const child of parentNode.children) {
            if ((child.type === "file" && canFileBeSummarized(child.name)) || child.type === "directory") {
              setSelectedNodes(prev => ({
                ...prev,
                [child.path]: isSelected
              }));
              
              if (isNodeSummarized(child)) {
                setRefreshNodes(prev => ({
                  ...prev,
                  [child.path]: isSelected
                }));
              }
              
              if (child.type === "directory" && child.children) {
                selectChildren(child, isSelected);
              }
            }
          }
        };
        
        selectChildren(node, checked);
        */
      }

      return
    }

    // Standard mode - If the node is already summarized, we can't select it
    if (isNodeSummarized(node) && !refreshNodes[nodePath]) return

    // Update selected nodes
    setSelectedNodes((prev) => ({
      ...prev,
      [nodePath]: checked,
    }))

    // If this is a directory that's already summarized and has newly selected children,
    // mark it for refresh
    if (node.type === "directory" && isNodeSummarized(node) && hasNewlySelectedChildren(node)) {
      setRefreshNodes((prev) => ({
        ...prev,
        [nodePath]: checked,
      }))
    }
  }

  // Check if a node can be selected
  const canSelectNode = (node: RepoNode): boolean => {
    // In refresh mode, all summarizable files and all directories can be selected
    if (showRefreshOptions) {
      if (node.type === "file") {
        return canFileBeSummarized(node.name)
      }
      return true // All directories can be selected in refresh mode
    }

    // Files that can't be summarized can't be selected
    if (node.type === "file" && !canFileBeSummarized(node.name)) return false

    // Already summarized files can't be selected again unless they're marked for refresh
    if (isNodeSummarized(node) && !refreshNodes[node.path]) return false

    // If it's a directory that's already summarized, it can only be selected if it has newly selected children
    if (node.type === "directory" && isNodeSummarized(node)) {
      return hasNewlySelectedChildren(node)
    }

    return true
  }

  // Toggle refresh mode
  const toggleRefreshMode = () => {
    setShowRefreshOptions(!showRefreshOptions)

    // Clear selections when toggling mode
    setSelectedNodes({})
    setRefreshNodes({})
  }

  // Start summarization process
  const startSummarization = async () => {
    if (!apiKey) {
      setError(`${apiProvider === "groq" ? "Groq" : "OpenAI"} API key is required for summarization.`)
      return
    }

    // Count total items to process
    const totalItems = Object.keys(selectedNodes).filter((path) => selectedNodes[path]).length

    if (totalItems === 0) {
      setError("Please select at least one item to summarize.")
      return
    }

    setIsSummarizing(true)
    setProgress(0)
    setProcessedCount({ current: 0, total: totalItems })
    setError(null)

    try {
      console.log(`Starting summarization of ${totalItems} items with ${apiProvider}`)
      console.log(
        "Selected nodes:",
        Object.keys(selectedNodes).filter((path) => selectedNodes[path]),
      )

      await onSummarize(selectedNodes, refreshNodes)

      // Close the popup after successful summarization
      setTimeout(() => {
        onClose()
      }, 1000)
    } catch (err) {
      console.error("Error during summarization:", err)
      setError(err instanceof Error ? err.message : "Failed to summarize selected items.")
    } finally {
      setIsSummarizing(false)
    }
  }

  // Update progress (this would be called from the parent component)
  useEffect(() => {
    if (isSummarizing) {
      const handleMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === "summarization-progress") {
          setProgress(event.data.progress)
          setCurrentItem(event.data.currentItem)
          setProcessedCount((prev) => ({
            ...prev,
            current: event.data.current,
          }))
        }
      }

      window.addEventListener("message", handleMessage)
      return () => window.removeEventListener("message", handleMessage)
    }
  }, [isSummarizing])

  // Render a tree node
  const renderNode = (node: RepoNode, depth = 0) => {
    const nodePath = node.path
    const isExpanded = expandedNodes.has(nodePath)
    const isSelected = selectedNodes[nodePath] || false
    const isSummarized = isNodeSummarized(node)
    const isRefresh = refreshNodes[nodePath] || false
    const canSelect = canSelectNode(node)
    const hasChildren = node.type === "directory" && node.children && node.children.length > 0

    return (
      <div key={nodePath} className="select-none">
        <div
          className={`flex items-center py-1 px-2 rounded-md ${
            isSummarized ? "bg-gray-100 dark:bg-gray-800" : ""
          } ${isSelected ? "bg-violet-50 dark:bg-violet-900/20" : ""}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleNodeExpansion(nodePath)}
              className="mr-1 p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
              )}
            </button>
          ) : (
            <span className="w-6" />
          )}

          <div className="flex items-center flex-1 min-w-0">
            <Checkbox
              id={`node-${nodePath}`}
              checked={isSelected}
              disabled={!canSelect || isSummarizing}
              onCheckedChange={(checked) => handleNodeSelection(node, checked === true)}
              className="mr-2"
            />

            {node.type === "directory" ? (
              <Folder className="h-4 w-4 text-violet-500 mr-2 flex-shrink-0" />
            ) : (
              <File
                className={`h-4 w-4 mr-2 flex-shrink-0 ${
                  canFileBeSummarized(node.name) ? "text-emerald-500" : "text-gray-400"
                }`}
              />
            )}

            <span className="truncate text-sm">{node.name}</span>

            <div className="ml-auto flex items-center gap-1.5">
              {isSummarized && (
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    isRefresh || (showRefreshOptions && isSelected)
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                  }`}
                >
                  {isRefresh || (showRefreshOptions && isSelected) ? (
                    <>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Refresh
                    </>
                  ) : (
                    <>
                      <Database className="h-3 w-3 mr-1" />
                      Cached
                    </>
                  )}
                </Badge>
              )}

              {node.type === "file" && !canFileBeSummarized(node.name) && (
                <Badge
                  variant="outline"
                  className="text-xs bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  Not Summarizable
                </Badge>
              )}
            </div>
          </div>
        </div>

        {isExpanded && hasChildren && <div>{node.children!.map((childNode) => renderNode(childNode, depth + 1))}</div>}
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Select Files and Directories to Summarize</DialogTitle>
        </DialogHeader>

        {isSummarizing ? (
          <div className="py-8 space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-medium mb-2">Summarizing...</h3>
              <p className="text-sm text-gray-500 mb-4">
                {currentItem ? (
                  <>
                    {processedCount.current} of {processedCount.total} items processed
                  </>
                ) : (
                  <>Preparing summarization...</>
                )}
              </p>
            </div>

            <Progress value={progress} className="w-full h-2" />

            {currentItem && (
              <div className="text-center text-sm text-gray-600 dark:text-gray-400 animate-pulse">
                Currently summarizing: {currentItem}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              <div className="flex justify-between items-center mb-2">
                <p>Select files and directories to summarize. Already summarized items are highlighted.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleRefreshMode}
                  className={`flex items-center gap-1 ${showRefreshOptions ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800" : ""}`}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {showRefreshOptions ? "Exit Refresh Mode" : "Refresh Mode"}
                </Button>
              </div>

              {showRefreshOptions ? (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-md mb-2">
                  <p className="font-medium">Refresh Mode Active</p>
                  <p className="text-xs mt-1">In this mode, you can select already summarized items to refresh them.</p>
                </div>
              ) : (
                <ul className="list-disc list-inside mt-2">
                  <li>Selecting a directory will summarize it based on its selected children</li>
                  <li>Already summarized files cannot be selected again</li>
                  <li>Directories with newly selected children can be refreshed</li>
                </ul>
              )}
            </div>

            <ScrollArea
              className="flex-1 border rounded-md p-2"
              style={{ height: "calc(100% - 200px)", minHeight: "300px" }}
            >
              {repoData ? (
                renderNode(repoData)
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-500">No repository data available</p>
                </div>
              )}
            </ScrollArea>

            {error && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-md text-sm">
                {error}
              </div>
            )}

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={startSummarization}
                disabled={Object.keys(selectedNodes).filter((path) => selectedNodes[path]).length === 0 || !apiKey}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white"
              >
                {showRefreshOptions ? "Refresh Selected Items" : "Summarize Selected Items"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
