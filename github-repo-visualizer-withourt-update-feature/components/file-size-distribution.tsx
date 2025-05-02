"use client"

import { useEffect, useRef } from "react"
import * as d3 from "d3"

interface RepoNode {
  name: string
  path: string
  type: "file" | "dir" | "directory"
  size?: number
  url: string
  children?: RepoNode[]
}

interface FileData {
  name: string
  path: string
  size: number
  url: string
}

interface FileSizeDistributionProps {
  data: RepoNode
}

export default function FileSizeDistribution({ data }: FileSizeDistributionProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !data) return

    // Extract all files with their sizes
    const files: FileData[] = []

    function extractFiles(node: RepoNode) {
      if ((node.type === "file" || node.type === "file") && node.size !== undefined) {
        files.push({
          name: node.name,
          path: node.path,
          size: node.size,
          url: node.url,
        })
      }

      if (node.children) {
        node.children.forEach(extractFiles)
      }
    }

    extractFiles(data)

    // Group files by size ranges
    const sizeRanges = [
      { name: "0-1KB", min: 0, max: 1024 },
      { name: "1-10KB", min: 1024, max: 10240 },
      { name: "10-100KB", min: 10240, max: 102400 },
      { name: "100KB-1MB", min: 102400, max: 1048576 },
      { name: "1MB+", min: 1048576, max: Number.POSITIVE_INFINITY },
    ]

    const fileCounts = sizeRanges.map((range) => ({
      range: range.name,
      count: files.filter((file) => file.size >= range.min && file.size < range.max).length,
    }))

    // Clear previous visualization
    d3.select(svgRef.current).selectAll("*").remove()

    const margin = { top: 20, right: 30, bottom: 40, left: 60 }
    const width = 800 - margin.left - margin.right
    const height = 400 - margin.top - margin.bottom

    const svg = d3
      .select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`)

    // Create scales
    const x = d3
      .scaleBand()
      .domain(fileCounts.map((d) => d.range))
      .range([0, width])
      .padding(0.1)

    const y = d3
      .scaleLinear()
      .domain([0, Math.max(...fileCounts.map((d) => d.count), 1)]) // Ensure non-zero domain
      .nice()
      .range([height, 0])

    // Create axes
    svg
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end")

    svg.append("g").call(d3.axisLeft(y))

    // Create bars
    svg
      .selectAll(".bar")
      .data(fileCounts)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", (d) => x(d.range) || 0)
      .attr("y", (d) => y(d.count))
      .attr("width", x.bandwidth())
      .attr("height", (d) => height - y(d.count))
      .attr("fill", "#4f46e5")
      .on("mouseover", function (event, d) {
        d3.select(this).attr("fill", "#6366f1")

        svg
          .append("text")
          .attr("class", "bar-tooltip")
          .attr("x", (x(d.range) || 0) + x.bandwidth() / 2)
          .attr("y", y(d.count) - 10)
          .attr("text-anchor", "middle")
          .text(`${d.count} files`)
      })
      .on("mouseout", function () {
        d3.select(this).attr("fill", "#4f46e5")
        svg.selectAll(".bar-tooltip").remove()
      })

    // Add labels
    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 0 - margin.left)
      .attr("x", 0 - height / 2)
      .attr("dy", "1em")
      .style("text-anchor", "middle")
      .text("Number of Files")

    svg
      .append("text")
      .attr("transform", `translate(${width / 2}, ${height + margin.bottom - 5})`)
      .style("text-anchor", "middle")
      .text("File Size Range")
  }, [data])

  return (
    <div className="overflow-x-auto">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  )
}
