// Minimal stand-in for the host SDK bridge used by extension UI tests.
const sdk = {
  i18n: { getLocale: () => 'pt-BR' },
  media: { url: (extensionId: string, file: string) => `/extensions/${extensionId}/${file}` }
}

export default sdk
