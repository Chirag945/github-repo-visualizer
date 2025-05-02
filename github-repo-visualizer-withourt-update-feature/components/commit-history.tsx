"use client"

import { useEffect, useRef } from "react"
import * as d3 from "d3"

interface Commit {
  sha: string
  commit: {
    author: {
      name: string
      date: string
    }
    message: string
  }
  html_url: string
}

interface CommitHistoryProps {
  commits: Commit[]
}

export default function CommitHistory({ commits }: CommitHistoryProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !commits.length) return

    // Clear previous visualization
    d3.select(svgRef.current).selectAll("*").remove()

    const margin = { top: 20, right: 30, bottom: 30, left: 40 }
    const width = 800 - margin.left - margin.right
    const height = 400 - margin.top - margin.bottom

    const svg = d3
      .select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`)

    // Process data
    const data = commits
      .map((commit, index) => ({
        date: new Date(commit.commit.author.date),
        count: index,
        message: commit.commit.message,
        url: commit.html_url,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())

    // Create scales
    const x = d3
      .scaleTime()
      .domain([data[0].date, data[data.length - 1].date])
      .range([0, width])

    const y = d3
      .scaleLinear()
      .domain([0, data.length - 1])
      .range([height, 0])

    // Create axes
    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x))

    svg.append("g").call(d3.axisLeft(y))

    // Create line
    const commitLine = d3
      .line<{ date: Date; count: number }>()
      .x((d) => x(d.date))
      .y((d) => y(d.count))

    svg
      .append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "steelblue")
      .attr("stroke-width", 1.5)
      .attr("d", commitLine)

    // Add points
    svg
      .selectAll(".commit-point")
      .data(data)
      .enter()
      .append("circle")
      .attr("class", "commit-point")
      .attr("cx", (d) => x(d.date))
      .attr("cy", (d) => y(d.count))
      .attr("r", 5)
      .attr("fill", "steelblue")
      .on("mouseover", function (event, d) {
        d3.select(this).attr("r", 8)

        svg
          .append("text")
          .attr("class", "commit-tooltip")
          .attr("x", x(d.date) + 10)
          .attr("y", y(d.count) - 10)
          .text(d.message.substring(0, 50) + (d.message.length > 50 ? "..." : ""))
      })
      .on("mouseout", function () {
        d3.select(this).attr("r", 5)
        svg.selectAll(".commit-tooltip").remove()
      })
      .on("click", (event, d) => {
        window.open(d.url, "_blank")
      })
  }, [commits])

  return (
    <div className="overflow-x-auto">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  )
}
