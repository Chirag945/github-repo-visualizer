"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, Github } from "lucide-react"
import { fetchRepoData } from "@/lib/github-api"

interface RepoNode {
  name: string
  type: "file" | "dir" | "directory"
  path: string
  url: string
  size?: number
  children?: RepoNode[]
  stats?: {
    files: number
    directories: number
  }
}

interface RepoComparisonProps {
  token: string
}

export default function RepoComparison({ token }: RepoComparisonProps) {
  const [repoId1, setRepoId1] = useState("")
  const [repoId2, setRepoId2] = useState("")
  const [isLoading1, setIsLoading1] = useState(false)
  const [isLoading2, setIsLoading2] = useState(false)
  const [error1, setError1] = useState<string | null>(null)
  const [error2, setError2] = useState<string | null>(null)
  const [repoData1, setRepoData1] = useState<RepoNode | null>(null)
  const [repoData2, setRepoData2] = useState<RepoNode | null>(null)

  const fetchRepo1 = async () => {
    if (!repoId1.trim()) return

    setIsLoading1(true)
    setError1(null)

    try {
      const parts = repoId1.split("/")
      if (parts.length !== 2) {
        throw new Error('Invalid repository format. Use "username/repo"')
      }

      const [owner, repo] = parts
      const data = await fetchRepoData(owner, repo, token)
      setRepoData1(data)
    } catch (err) {
      setError1(err instanceof Error ? err.message : "Failed to fetch repository data")
    } finally {
      setIsLoading1(false)
    }
  }

  const fetchRepo2 = async () => {
    if (!repoId2.trim()) return

    setIsLoading2(true)
    setError2(null)

    try {
      const parts = repoId2.split("/")
      if (parts.length !== 2) {
        throw new Error('Invalid repository format. Use "username/repo"')
      }

      const [owner, repo] = parts
      const data = await fetchRepoData(owner, repo, token)
      setRepoData2(data)
    } catch (err) {
      setError2(err instanceof Error ? err.message : "Failed to fetch repository data")
    } finally {
      setIsLoading2(false)
    }
  }

  // Count files in a repository
  const countFiles = (node: RepoNode): number => {
    if (node.type === "file") return 1

    if (node.children) {
      return node.children.reduce((count, child) => count + countFiles(child), 0)
    }

    return 0
  }

  // Count directories in a repository
  const countDirectories = (node: RepoNode): number => {
    if (node.type === "file") return 0

    if (node.children) {
      return 1 + node.children.reduce((count, child) => count + countDirectories(child), 0)
    }

    return 1
  }

  // Calculate max depth of a repository
  const calculateMaxDepth = (node: RepoNode, currentDepth = 0): number => {
    if (node.type === "file") return currentDepth

    if (node.children && node.children.length > 0) {
      return Math.max(...node.children.map((child) => calculateMaxDepth(child, currentDepth + 1)))
    }

    return currentDepth
  }

  // Calculate total size of a repository
  const calculateTotalSize = (node: RepoNode): number => {
    if (node.type === "file") return node.size || 0

    if (node.children) {
      return node.children.reduce((size, child) => size + calculateTotalSize(child), 0)
    }

    return 0
  }

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Repository 1 */}
      <Card>
        <CardHeader>
          <CardTitle>Repository 1</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="relative">
              <Github className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
              <Input
                value={repoId1}
                onChange={(e) => setRepoId1(e.target.value)}
                placeholder="username/repo"
                className="pl-10"
              />
            </div>
            <Button onClick={fetchRepo1} disabled={isLoading1} className="w-full">
              {isLoading1 ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Fetch Repository
            </Button>

            {error1 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error1}</AlertDescription>
              </Alert>
            )}

            {repoData1 && (
              <div className="space-y-2 mt-4">
                <h3 className="font-medium text-lg">{repoData1.name}</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Files</div>
                    <div className="font-medium">{countFiles(repoData1)}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Directories</div>
                    <div className="font-medium">{countDirectories(repoData1)}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Max Depth</div>
                    <div className="font-medium">{calculateMaxDepth(repoData1)}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Total Size</div>
                    <div className="font-medium">{formatFileSize(calculateTotalSize(repoData1))}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Repository 2 */}
      <Card>
        <CardHeader>
          <CardTitle>Repository 2</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="relative">
              <Github className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
              <Input
                value={repoId2}
                onChange={(e) => setRepoId2(e.target.value)}
                placeholder="username/repo"
                className="pl-10"
              />
            </div>
            <Button onClick={fetchRepo2} disabled={isLoading2} className="w-full">
              {isLoading2 ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Fetch Repository
            </Button>

            {error2 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error2}</AlertDescription>
              </Alert>
            )}

            {repoData2 && (
              <div className="space-y-2 mt-4">
                <h3 className="font-medium text-lg">{repoData2.name}</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Files</div>
                    <div className="font-medium">{countFiles(repoData2)}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Directories</div>
                    <div className="font-medium">{countDirectories(repoData2)}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Max Depth</div>
                    <div className="font-medium">{calculateMaxDepth(repoData2)}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Total Size</div>
                    <div className="font-medium">{formatFileSize(calculateTotalSize(repoData2))}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Comparison */}
      {repoData1 && repoData2 && (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium text-lg mb-2">{repoData1.name}</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Files:</span>
                    <span className="font-medium">{countFiles(repoData1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Directories:</span>
                    <span className="font-medium">{countDirectories(repoData1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max Depth:</span>
                    <span className="font-medium">{calculateMaxDepth(repoData1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Size:</span>
                    <span className="font-medium">{formatFileSize(calculateTotalSize(repoData1))}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium text-lg mb-2">{repoData2.name}</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Files:</span>
                    <span className="font-medium">{countFiles(repoData2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Directories:</span>
                    <span className="font-medium">{countDirectories(repoData2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max Depth:</span>
                    <span className="font-medium">{calculateMaxDepth(repoData2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Size:</span>
                    <span className="font-medium">{formatFileSize(calculateTotalSize(repoData2))}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t">
              <h3 className="font-medium text-lg mb-4">Differences</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Files Difference</div>
                  <div className="font-medium text-lg">
                    {Math.abs(countFiles(repoData1) - countFiles(repoData2))}
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                      ({countFiles(repoData1) > countFiles(repoData2) ? repoData1.name : repoData2.name} has more)
                    </span>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Directories Difference</div>
                  <div className="font-medium text-lg">
                    {Math.abs(countDirectories(repoData1) - countDirectories(repoData2))}
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                      ({countDirectories(repoData1) > countDirectories(repoData2) ? repoData1.name : repoData2.name} has
                      more)
                    </span>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Size Difference</div>
                  <div className="font-medium text-lg">
                    {formatFileSize(Math.abs(calculateTotalSize(repoData1) - calculateTotalSize(repoData2)))}
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                      ({calculateTotalSize(repoData1) > calculateTotalSize(repoData2) ? repoData1.name : repoData2.name}{" "}
                      is larger)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
