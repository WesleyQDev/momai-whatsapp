import { registerRenderer } from './SkillResponseRegistry'
import GenericExtensionCard from './GenericExtensionCard'

/* Register the generic renderer for all extension types */
registerRenderer('generic-extension', GenericExtensionCard)

export { GenericExtensionCard }
