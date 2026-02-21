import { Contribution } from './usercontrib.js'
import { getColorScheme } from './sites.js'

export interface HeatmapOptions {
  colorScheme: string
  round: number
  vertical: boolean
}

function getContributionColor(count: number, colors: string[]): string {
  if (count === 0) return '#ffffff'
  if (count <= 3) return colors[0]
  if (count <= 10) return colors[1]
  if (count <= 20) return colors[2]
  return colors[3]
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getWeekdayOffset(startDate: string): number {
  const date = new Date(startDate)
  return Number.isNaN(date.getTime()) ? 0 : date.getDay()
}

function buildMonthLabels(
  data: Contribution[],
  cellSize: number,
  gap: number,
  startOffset: number,
  startWeekday: number,
  vertical: boolean
): string {
  const monthPositions: Array<{ month: number; pos: number }> = []
  let lastLabeledWeek = -1
  if (data.length === 0) return ''

  let prevDate = new Date(data[0].time)
  let prevMonth = Number.isNaN(prevDate.getTime()) ? -1 : prevDate.getMonth()

  for (let i = 1; i < data.length; i++) {
    const date = new Date(data[i].time)
    if (Number.isNaN(date.getTime())) continue
    const month = date.getMonth()
    if (month !== prevMonth) {
      const weekIndex = Math.floor((i + startWeekday) / 7)
      if (weekIndex !== lastLabeledWeek) {
        const pos = weekIndex * (cellSize + gap)
        monthPositions.push({ month, pos })
        lastLabeledWeek = weekIndex
      }
      prevMonth = month
    }
  }

  const labels: string[] = []
  for (const { month, pos } of monthPositions) {
    if (vertical) {
      labels.push(
        `  <text class="heatmap-label" x="${startOffset}" y="${pos + cellSize}" text-anchor="end">${MONTH_LABELS[month]}</text>`
      )
    } else {
      labels.push(
        `  <text class="heatmap-label" x="${pos}" y="${startOffset}" text-anchor="start">${MONTH_LABELS[month]}</text>`
      )
    }
  }

  return labels.join('\n') + (labels.length ? '\n' : '')
}

function buildWeekdayLabels(
  startWeekday: number,
  cellSize: number,
  gap: number,
  startOffset: number,
  vertical: boolean
): string {
  const labels: string[] = []
  for (let i = 0; i < 7; i++) {
    const labelIndex = (startWeekday + i) % 7
    const pos = i * (cellSize + gap) + cellSize
    if (vertical) {
      labels.push(
        `  <text class="heatmap-label" x="${pos}" y="${startOffset}" text-anchor="middle">${WEEKDAY_LABELS[labelIndex]}</text>`
      )
    } else {
      labels.push(
        `  <text class="heatmap-label" x="${startOffset}" y="${pos}" text-anchor="end">${WEEKDAY_LABELS[labelIndex]}</text>`
      )
    }
  }

  return labels.join('\n') + (labels.length ? '\n' : '')
}

function generateHorizontalHeatmap(
  data: Contribution[],
  colors: string[],
  round: number
): string {
  const cellSize = 14
  const gap = 2
  const weekCount = Math.ceil(data.length / 7)
  const leftPadding = 34
  const topPadding = 24
  const width = weekCount * (cellSize + gap) + leftPadding + 10
  const height = 7 * (cellSize + gap) + topPadding + 10
  const weekdayOffset = getWeekdayOffset(data[0]?.time ?? '')

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
<style>
  .heatmap-cell { cursor: pointer; transition: opacity 0.2s; }
  .heatmap-cell:hover { opacity: 0.8; }
  .heatmap-label { font-size: 10px; fill: #666; font-family: monospace; }
</style>
<defs>
  <filter id="shadow">
    <feDropShadow dx="0" dy="0" stdDeviation="1" flood-opacity="0.3"/>
  </filter>
</defs>
<g transform="translate(${leftPadding}, ${topPadding})">\n`

  svg += buildMonthLabels(data, cellSize, gap, -8, weekdayOffset, false)
  svg += buildWeekdayLabels(weekdayOffset, cellSize, gap, -6, false)

  // Draw cells
  let cellIndex = 0
  for (let week = 0; week < weekCount; week++) {
    for (let day = 0; day < 7; day++) {
      if (cellIndex >= data.length) break

      const item = data[cellIndex]
      const x = week * (cellSize + gap)
      const y = day * (cellSize + gap)
      const color = getContributionColor(item.count, colors)
      const rx = round

      svg += `  <g>
    <title>${item.time}: ${item.count} edits</title>
    <rect class="heatmap-cell" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${color}" rx="${rx}" stroke="#ddd" stroke-width="0.5" >
    <title>${item.time}: ${item.count} edits</title>
    </rect>
  </g>\n`;

      cellIndex++
    }
  }

  svg += `</g>
</svg>`

  return svg
}

function generateVerticalHeatmap(
  data: Contribution[],
  colors: string[],
  round: number
): string {
  const cellSize = 14
  const gap = 2
  const weekCount = Math.ceil(data.length / 7)
  const leftPadding = 34
  const topPadding = 24
  const width = 7 * (cellSize + gap) + leftPadding + 10
  const height = weekCount * (cellSize + gap) + topPadding + 10
  const weekdayOffset = getWeekdayOffset(data[0]?.time ?? '')

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
<style>
  .heatmap-cell { cursor: pointer; transition: opacity 0.2s; pointer-events: all !important;}
  .heatmap-cell:hover { opacity: 0.8; }
  .heatmap-label { font-size: 10px; fill: #666; font-family: monospace; }
</style>
<defs>
  <filter id="shadow">
    <feDropShadow dx="0" dy="0" stdDeviation="1" flood-opacity="0.3"/>
  </filter>
</defs>
<g transform="translate(${leftPadding}, ${topPadding})">\n`;

  svg += buildWeekdayLabels(weekdayOffset, cellSize, gap, -6, true)
  svg += buildMonthLabels(data, cellSize, gap, -6, weekdayOffset, true)

  // Draw cells
  let cellIndex = 0
  for (let week = 0; week < weekCount; week++) {
    for (let day = 0; day < 7; day++) {
      if (cellIndex >= data.length) break

      const item = data[cellIndex]
      const x = day * (cellSize + gap)
      const y = week * (cellSize + gap)
      const color = getContributionColor(item.count, colors)
      const rx = round

      svg += `  <g>
    <rect class="heatmap-cell" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${color}" rx="${rx}" stroke="#ddd" stroke-width="0.5">
    <title>${item.time}: ${item.count} edits</title>
    </rect>
  </g>\n`;

      cellIndex++
    }
  }

  svg += `</g>
</svg>`

  return svg
}

export function generateSVG(
  data: Contribution[],
  options: HeatmapOptions
): string {
  const colors = getColorScheme(options.colorScheme)

  if (options.vertical) {
    return generateVerticalHeatmap(data, colors, options.round)
  }

  return generateHorizontalHeatmap(data, colors, options.round)
}
