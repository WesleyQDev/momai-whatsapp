import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useInstalledSkill } from '../hooks/useInstalledSkill'
import { loadSkillRenderer } from '../components/chat/ExtensionRendererLoader'
import { getRenderer } from '../components/chat/SkillResponseRegistry'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

interface Props {
  fallback?: React.ComponentType<{ extensionId: string }>
}

export default function ExtensionPageRoute({ fallback: Fallback }: Props) {
  const { id } = useParams<{ id: string }>()
  const skill = useInstalledSkill(id)
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    if (!skill?.ui?.page) {
      setComponent(null)
      return
    }
    setComponent(null)
    setError(null)
    const ui = skill.ui
    loadSkillRenderer(skill.id, ui, `/extensions/${skill.id}/dist`)
      .then(() => {
        const Renderer = getRenderer(ui.pageType!)
        if (!Renderer) throw new Error(`Renderer not registered: ${ui.pageType}`)
        setComponent(() => Renderer)
      })
      .catch((err) => setError(err.message || 'Failed to load extension'))
  }, [id, skill])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-text-muted">
        <div className="text-center space-y-2">
          <p className="text-red-400">Erro ao carregar extensão: {error}</p>
        </div>
      </div>
    )
  }

  if (!skill) {
    return <div className="p-8 text-text-muted">Extensão não encontrada: {id}</div>
  }

  if (!skill.ui?.page) {
    return Fallback ? <Fallback extensionId={skill.id} /> : <div className="p-8 text-text-muted">Esta extensão não tem UI full-page</div>
  }

  if (!Component) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        <ArrowPathIcon className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  return <Component extensionId={skill.id} manifest={skill} />
}
