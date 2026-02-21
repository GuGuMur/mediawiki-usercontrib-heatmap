import configContent from './config.json' with { type: 'json' }

export interface SiteConfig {
  api: string
  color?: string
  round?: number
  timezone?: string
}

export interface Settings {
  RefreshTimeOut: number
  colors: Record<string, string[]>
}

export interface ConfigData {
  sites: Record<string, SiteConfig>
  settings: Settings
}


function loadConfig(): ConfigData {

  return configContent as ConfigData
}

export function getSiteConfig(siteName: string): SiteConfig | null {
  const cfg = loadConfig()
  const siteData = cfg.sites[siteName]

  if (!siteData) return null

  return siteData as SiteConfig
}

export function getAllColorSets(): string[] {
  const cfg = loadConfig()
  return Object.keys(cfg.settings.colors)
}

export function getColorScheme(name: string): string[] {
  const cfg = loadConfig()
  return cfg.settings.colors[name] || cfg.settings.colors.default
}

export function getRefreshTimeout(): number {
  const cfg = loadConfig()
  return (cfg.settings.RefreshTimeOut || 60) * 60 * 1000 // Convert to milliseconds
}

export function getAllSites(): string[] {
  const cfg = loadConfig()
  return Object.keys(cfg.sites)
}
