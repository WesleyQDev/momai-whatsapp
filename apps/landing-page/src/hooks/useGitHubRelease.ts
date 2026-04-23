import { useEffect, useState } from 'react'
import { REPO } from '@/constants'
import type { DownloadUrls, GitHubRelease } from '@/types'

const CACHE_KEYS = {
  exe: 'momai_latest_exe_v3',
  linux: 'momai_latest_linux_v3',
  version: 'momai_latest_version_v3',
  downloads: 'momai_total_downloads_v3',
}

export function useGitHubRelease() {
  const [urls, setUrls] = useState<DownloadUrls>({
    winExeUrl: `https://github.com/${REPO}/releases/latest`,
    linuxUrl: `https://github.com/${REPO}/releases/latest`,
    version: '',
  })
  const [totalDownloads, setTotalDownloads] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchRelease() {
      const cachedExe = sessionStorage.getItem(CACHE_KEYS.exe)
      const cachedLinux = sessionStorage.getItem(CACHE_KEYS.linux)
      const cachedVersion = sessionStorage.getItem(CACHE_KEYS.version)
      const cachedDownloads = sessionStorage.getItem(CACHE_KEYS.downloads)

      if (cachedVersion && cachedExe && cachedLinux) {
        if (!cancelled) {
          setUrls({
            winExeUrl: cachedExe,
            linuxUrl: cachedLinux,
            version: cachedVersion,
          })
          if (cachedDownloads) {
            setTotalDownloads(Number(cachedDownloads))
          }
          setLoading(false)
        }
        return
      }

      try {
        // Busca TODAS as releases para somar downloads acumulados
        const resList = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`)
        let allReleases: GitHubRelease[] = []

        if (resList.ok) {
          allReleases = await resList.json()
        }

        // Soma downloads de TODOS os assets de TODAS as releases
        let total = 0
        if (Array.isArray(allReleases)) {
          total = allReleases.reduce((releaseSum, release) => {
            if (!release.assets) return releaseSum
            return releaseSum + release.assets.reduce((assetSum, asset) => {
              return assetSum + (asset.download_count || 0)
            }, 0)
          }, 0)
        }

        // Pega a última release para as URLs de download
        const latest = Array.isArray(allReleases) && allReleases.length > 0 ? allReleases[0] : null

        let winExeUrl = `https://github.com/${REPO}/releases/latest`
        let linuxUrl = `https://github.com/${REPO}/releases/latest`
        let version = ''

        if (latest && latest.assets) {
          const winAsset = latest.assets.find((a) => a.name.endsWith('.exe'))
          const linuxAsset =
            latest.assets.find((a) => a.name.endsWith('.AppImage')) ||
            latest.assets.find((a) => a.name.endsWith('.deb'))
          version = latest.tag_name || latest.name || ''
          winExeUrl = winAsset?.browser_download_url || winExeUrl
          linuxUrl = linuxAsset?.browser_download_url || linuxUrl
        }

        sessionStorage.setItem(CACHE_KEYS.exe, winExeUrl)
        sessionStorage.setItem(CACHE_KEYS.linux, linuxUrl)
        sessionStorage.setItem(CACHE_KEYS.version, version)
        sessionStorage.setItem(CACHE_KEYS.downloads, String(total))

        if (!cancelled) {
          setUrls({ winExeUrl, linuxUrl, version })
          setTotalDownloads(total)
        }
      } catch (err) {
        console.error('Erro ao buscar releases do GitHub:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchRelease()
    return () => {
      cancelled = true
    }
  }, [])

  return { urls, loading, totalDownloads }
}
