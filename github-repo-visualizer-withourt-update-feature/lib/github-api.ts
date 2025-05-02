// Function to fetch repository data from GitHub API
export async function fetchRepoData(owner: string, repo: string, token?: string) {
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
  }

  if (token) {
    headers["Authorization"] = `token ${token}`
  }

  // First, get the default branch
  const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })

  if (!repoResponse.ok) {
    throw new Error(`Failed to fetch repository: ${repoResponse.statusText}`)
  }

  const repoInfo = await repoResponse.json()
  const defaultBranch = repoInfo.default_branch

  // Then, get the tree recursively
  const treeResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
    { headers },
  )

  if (!treeResponse.ok) {
    throw new Error(`Failed to fetch repository tree: ${treeResponse.statusText}`)
  }

  const treeData = await treeResponse.json()

  // Build the tree structure
  return buildTreeStructure(treeData.tree, owner, repo, defaultBranch)
}

// Function to build a hierarchical tree structure from the flat GitHub API response
function buildTreeStructure(items: any[], owner: string, repo: string, branch = "master") {
  // Create the root node
  const root = {
    name: repo,
    path: "",
    type: "dir" as const,
    url: `https://github.com/${owner}/${repo}`,
    children: [],
  }

  // Map to store all nodes by path for quick lookup
  const nodeMap = new Map()
  nodeMap.set("", root)

  // Process each item from the GitHub API
  items.forEach((item) => {
    // Skip git metadata
    if (item.path.includes(".git/")) return

    const isDirectory = item.type === "tree"
    const path = item.path
    const name = path.split("/").pop()

    // Create the node
    const node = {
      name,
      path,
      type: isDirectory ? ("dir" as const) : ("file" as const),
      size: isDirectory ? undefined : item.size,
      url: `https://github.com/${owner}/${repo}/${isDirectory ? "tree" : "blob"}/${branch}/${path}`,
      children: isDirectory ? [] : undefined,
    }

    // Add to the map
    nodeMap.set(path, node)

    // Add to parent
    if (path.includes("/")) {
      const parentPath = path.substring(0, path.lastIndexOf("/"))
      const parent = nodeMap.get(parentPath)

      if (parent && parent.children) {
        parent.children.push(node)
      }
    } else {
      // Top-level item
      root.children.push(node)
    }
  })

  return root
}

// Update the fetchCommitHistory function to handle errors better
export async function fetchCommitHistory(owner: string, repo: string, token?: string) {
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
  }

  if (token) {
    headers["Authorization"] = `token ${token}`
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`, { headers })

    if (!response.ok) {
      // Get more detailed error information
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.message || response.statusText

      if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
        throw new Error(`API rate limit exceeded. Please provide a GitHub token to increase the limit.`)
      }

      throw new Error(`Failed to fetch commits: ${errorMessage}`)
    }

    return await response.json()
  } catch (error) {
    // Re-throw with a more descriptive message if it's not already an Error
    if (error instanceof Error) {
      throw error
    } else {
      throw new Error(`Failed to fetch commits: ${error}`)
    }
  }
}

// Function to get the download URL for a repository
export function getRepoDownloadUrl(owner: string, repo: string, branch = "master") {
  return `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`
}
