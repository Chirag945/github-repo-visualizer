"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert } from "@/components/ui/alert"
import { File, Folder, PlusCircle, Pencil, Trash2 } from "lucide-react"

interface RepoNode {
  name: string
  type: "file" | "directory"
  path: string
  url: string
  size?: number
  children?: RepoNode[]
}

interface RepoChange {
  type: "added" | "updated" | "deleted"
  node: RepoNode
}

// Update the RepoChangesPopupProps interface to include pendingUpdates
interface RepoChangesPopupProps {
  isOpen: boolean
  onClose: () => void
  changes: RepoChange[]
  pendingUpdates?: RepoChange[] // Make this optional
  onUpdateSummaries: (changes: RepoChange[]) => Promise<void>
  onSkipUpdates?: () => void // Make this optional
}

// Update the component to use both changes and pendingUpdates
export default function RepoChangesPopup({
  isOpen,
  onClose,
  changes = [],
  pendingUpdates = [], // Add default empty array here
  onUpdateSummaries,
  onSkipUpdates,
}: RepoChangesPopupProps) {
  // Combine changes and pendingUpdates, removing duplicates
  const allChanges = [...changes]

  // Add pending updates that aren't already in changes
  // Add a check to ensure pendingUpdates is an array
  if (Array.isArray(pendingUpdates)) {
    pendingUpdates.forEach((pendingChange) => {
      const exists = allChanges.some(
        (change) => change.node.path === pendingChange.node.path && change.type === pendingChange.type,
      )
      if (!exists) {
        allChanges.push(pendingChange)
      }
    })
  }

  // Update the handleUpdate function to close the popup immediately before starting the update
  const handleUpdate = () => {
    onClose() // Close popup immediately
    // Start the update process after closing
    setTimeout(() => {
      onUpdateSummaries(allChanges)
    }, 100)
  }

  // Simplified handleSkip function that just closes the dialog
  const handleSkip = () => {
    console.log("Skipping updates, closing dialog")
    // First close the dialog
    onClose()

    // Then call onSkipUpdates if it exists (after a small delay to ensure dialog closes)
    setTimeout(() => {
      if (typeof onSkipUpdates === "function") {
        onSkipUpdates()
      }
    }, 100)
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-w-2xl h-[70vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Repository Changes Detected</DialogTitle>
        </DialogHeader>

        {allChanges.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">No changes detected.</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 border rounded-md p-2">
            <div className="space-y-3">
              {allChanges.map((change, index) => (
                <div
                  key={index}
                  className="p-3 rounded-md bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center gap-2">
                    {change.node.type === "file" ? <File className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
                    <span className="text-sm font-medium">{change.node.name}</span>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Path: {change.node.path}</div>
                  <div className="text-sm">
                    {change.type === "added" && (
                      <Alert variant="default">
                        <PlusCircle className="h-4 w-4 mr-2" />
                        New {change.node.type} detected.
                      </Alert>
                    )}
                    {change.type === "updated" && (
                      <Alert variant="default">
                        <Pencil className="h-4 w-4 mr-2" />
                        {change.node.type} updated.
                      </Alert>
                    )}
                    {change.type === "deleted" && (
                      <Alert variant="destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        {change.node.type} deleted.
                      </Alert>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={handleSkip}>
            Skip Updates
          </Button>
          <Button type="button" onClick={handleUpdate}>
            Update Summaries
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
