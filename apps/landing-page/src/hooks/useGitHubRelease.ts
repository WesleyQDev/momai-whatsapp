import { useEffect, useState } from 'react'
import type { DownloadUrls, GitHubRelease } from '@/types'

const REPO = 'WesleyQDev/MomAI-App'
const CACHE_KEYS = {
  exe: 'momai_latest_exe_v3',
  linux: 'momai_latest_linux_v3',
  version: 'momai_latest_version_v3',
}

export function useGitHubRelease() {
  const [urls, setUrls] = useState<DownloadUrls>({
    winExeUrl: `https://github.com/${REPO}/releases/latest`,
    linuxUrl: `https://github.com/${REPO}/releases/latest`,
    version: '',
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchRelease() {
      const cachedExe = sessionStorage.getItem(CACHE_KEYS.exe)
      const cachedLinux = sessionStorage.getItem(CACHE_KEYS.linux)
      const cachedVersion = sessionStorage.getItem(CACHE_KEYS.version)

      if (cachedVersion && cachedExe && cachedLinux) {
        if (!cancelled) {
          setUrls({
            winExeUrl: cachedExe,
            linuxUrl: cachedLinux,
            version: cachedVersion,
          })
          setLoading(false)
        }
        return
      }

      try {
        let res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
        let data: GitHubRelease | null = null

        if (res.ok) {
          data = await res.json()
        } else if (res.status === 404) {
          const resList = await fetch(`https://api.github.com/repos/${REPO}/releases`)
          if (resList.ok) {
            const list = await resList.json()
            if (list && list.length > 0) data = list[0]
          }
        }

        if (data && data.assets) {
          const winAsset = data.assets.find((a) => a.name.endsWith('.exe'))
          const linuxAsset =
            data.assets.find((a) => a.name.endsWith('.AppImage')) ||
            data.assets.find((a) => a.name.endsWith('.deb'))
          const version = data.tag_name || data.name || ''
          const winExeUrl =
            winAsset?.browser_download_url || `https://github.com/${REPO}/releases/latest`
          const linuxUrl =
            linuxAsset?.browser_download_url || `https://github.com/${REPO}/releases/latest`

          sessionStorage.setItem(CACHE_KEYS.exe, winExeUrl)
          sessionStorage.setItem(CACHE_KEYS.linux, linuxUrl)
          sessionStorage.setItem(CACHE_KEYS.version, version)

          if (!cancelled) {
            setUrls({ winExeUrl, linuxUrl, version })
          }
        }
      } catch (err) {
        console.error('Erro ao buscar release do GitHub:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchRelease()
    return () => {
      cancelled = true
    }
  }, [])

  return { urls, loading }
}
