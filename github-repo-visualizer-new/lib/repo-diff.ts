import type { FileSummary } from "@/app/actions"

export interface RepoNode {
  name: string
  type: "file" | "directory"
  path: string
  url: string
  size?: number
  children?: RepoNode[]
}

export interface RepoChange {
  type: "added" | "updated" | "deleted"
  node: RepoNode
}

/**
 * Compare two repository structures to detect changes
 */
export function detectRepoChanges(
  currentRepo: RepoNode | null,
  previousRepo: RepoNode | null,
  fileSummaries: Record<string, FileSummary>,
  repoOwner: string,
  repoName: string,
): RepoChange[] {
  if (!previousRepo) return []
  if (!currentRepo) return []

  const changes: RepoChange[] = []

  // Create maps for faster lookups
  const currentNodeMap = new Map<string, RepoNode>()
  const previousNodeMap = new Map<string, RepoNode>()

  // Helper function to populate the node maps
  function populateNodeMap(node: RepoNode, map: Map<string, RepoNode>) {
    map.set(node.path, node)
    if (node.children) {
      node.children.forEach((child) => populateNodeMap(child, map))
    }
  }

  // Populate maps
  populateNodeMap(currentRepo, currentNodeMap)
  populateNodeMap(previousRepo, previousNodeMap)

  // Check for added or updated nodes
  currentNodeMap.forEach((node, path) => {
    const previousNode = previousNodeMap.get(path)

    if (!previousNode) {
      // Node was added
      changes.push({ type: "added", node })
    } else if (node.type === "file" && previousNode.type === "file") {
      // Check if file was updated (size changed)
      if (node.size !== previousNode.size) {
        changes.push({ type: "updated", node })
      }
    }
  })

  // Check for deleted nodes
  previousNodeMap.forEach((node, path) => {
    if (!currentNodeMap.has(path)) {
      // Node was deleted
      changes.push({ type: "deleted", node })
    }
  })

  return changes
}

/**
 * Get the summary key for a node
 */
export function getSummaryKey(node: RepoNode, owner: string, repo: string): string {
  return `${owner}/${repo}:${node.path}`
}

/**
 * Delete summaries for deleted nodes
 */
export function removeDeletedSummaries(
  deletedNodes: RepoNode[],
  fileSummaries: Record<string, FileSummary>,
  owner: string,
  repo: string,
): Record<string, FileSummary> {
  const updatedSummaries = { ...fileSummaries }

  deletedNodes.forEach((node) => {
    const summaryKey = getSummaryKey(node, owner, repo)
    if (updatedSummaries[summaryKey]) {
      delete updatedSummaries[summaryKey]
    }
  })

  return updatedSummaries
}
