export type Theme = 'dark' | 'light'
export type Platform = 'win' | 'linux' | 'mac'

export interface GitHubRelease {
  tag_name: string
  name: string
  assets: Array<{
    name: string
    browser_download_url: string
    download_count: number
  }>
}

export interface DownloadUrls {
  winExeUrl: string
  linuxUrl: string
  version: string
}
