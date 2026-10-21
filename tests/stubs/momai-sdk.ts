// Minimal stand-in for the host SDK bridge used by extension UI tests.
import ContextMenu from '../../../../momai/packages/momai-sdk/src/ContextMenu'

const sdk = {
  i18n: { getLocale: () => 'pt-BR' },
  media: { url: (extensionId: string, file: string) => `/extensions/${extensionId}/${file}` },
  ContextMenu
}

export { ContextMenu }
export default sdk
