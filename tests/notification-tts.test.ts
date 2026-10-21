import { describe, it, expect } from 'vitest'
import utils from '../worker-utils'

const { stripEmojis, isOnlyEmojiMessage, isPhoneNumberString, getNotificationTtsText } =
  utils as any

describe('stripEmojis', () => {
  it('removes emojis from the end, beginning, or middle of a string', () => {
    expect(stripEmojis('Oi tudo bem? 😀')).toBe('Oi tudo bem?')
    expect(stripEmojis('😀 Partiu almoço')).toBe('Partiu almoço')
    expect(stripEmojis('Oi 😀 tudo bem? 🔥')).toBe('Oi tudo bem?')
    expect(stripEmojis('Parabéns 🎉🎂 pelo dia!')).toBe('Parabéns pelo dia!')
  })

  it('removes complex emojis with skin tones, flags, keycaps and ZWJ sequences', () => {
    expect(stripEmojis('Tudo bem 👍🏽')).toBe('Tudo bem')
    expect(stripEmojis('Viva o Brasil 🇧🇷!')).toBe('Viva o Brasil!')
    expect(stripEmojis('Família 👨‍👩‍👧‍👦 unida')).toBe('Família unida')
    expect(stripEmojis('Opção 1️⃣ selecionada')).toBe('Opção selecionada')
  })

  it('returns empty string when text consists only of emojis and whitespace', () => {
    expect(stripEmojis('😀')).toBe('')
    expect(stripEmojis('😀 🔥 👍')).toBe('')
    expect(stripEmojis('  👍🏽  ')).toBe('')
    expect(stripEmojis('1️⃣ 2️⃣ 3️⃣')).toBe('')
  })

  it('preserves plain text, regular numbers and punctuation', () => {
    expect(stripEmojis('Olá mundo!')).toBe('Olá mundo!')
    expect(stripEmojis('12345')).toBe('12345')
    expect(stripEmojis('R$ 50,00 #partiu')).toBe('R$ 50,00 #partiu')
    expect(stripEmojis('')).toBe('')
  })
})

describe('isOnlyEmojiMessage', () => {
  it('returns true for single emoji', () => {
    expect(isOnlyEmojiMessage('😀')).toBe(true)
    expect(isOnlyEmojiMessage('👍')).toBe(true)
    expect(isOnlyEmojiMessage('❤️')).toBe(true)
    expect(isOnlyEmojiMessage('🔥')).toBe(true)
  })

  it('returns true for emojis with skin tone modifiers', () => {
    expect(isOnlyEmojiMessage('👍🏽')).toBe(true)
    expect(isOnlyEmojiMessage('👋🏻')).toBe(true)
  })

  it('returns true for regional indicator flags', () => {
    expect(isOnlyEmojiMessage('🇧🇷')).toBe(true)
    expect(isOnlyEmojiMessage('🇺🇸')).toBe(true)
  })

  it('returns true for ZWJ sequences and keycaps', () => {
    expect(isOnlyEmojiMessage('👨‍👩‍👧‍👦')).toBe(true)
    expect(isOnlyEmojiMessage('1️⃣')).toBe(true)
    expect(isOnlyEmojiMessage('#️⃣')).toBe(true)
  })

  it('returns true for multiple emojis with or without spaces', () => {
    expect(isOnlyEmojiMessage('😀🔥👍')).toBe(true)
    expect(isOnlyEmojiMessage('😀 🔥 👍')).toBe(true)
    expect(isOnlyEmojiMessage('  😀   ')).toBe(true)
  })

  it('returns false when text is present alongside emoji', () => {
    expect(isOnlyEmojiMessage('Oi tudo bem? 😀')).toBe(false)
    expect(isOnlyEmojiMessage('😀 legal')).toBe(false)
    expect(isOnlyEmojiMessage('Bora almoçar? 🍕')).toBe(false)
    expect(isOnlyEmojiMessage('😀!')).toBe(false)
  })

  it('returns false for plain text, numbers, spaces or empty strings', () => {
    expect(isOnlyEmojiMessage('Olá mundo')).toBe(false)
    expect(isOnlyEmojiMessage('12345')).toBe(false)
    expect(isOnlyEmojiMessage('')).toBe(false)
    expect(isOnlyEmojiMessage('   ')).toBe(false)
    expect(isOnlyEmojiMessage(null)).toBe(false)
    expect(isOnlyEmojiMessage(undefined)).toBe(false)
  })
})

describe('isPhoneNumberString', () => {
  it('detects standard phone number strings', () => {
    expect(isPhoneNumberString('5511999990000')).toBe(true)
    expect(isPhoneNumberString('+55 11 99999-0000')).toBe(true)
    expect(isPhoneNumberString('11999998888')).toBe(true)
  })

  it('rejects contact names and mixed strings', () => {
    expect(isPhoneNumberString('Wesley')).toBe(false)
    expect(isPhoneNumberString('Wesley 2')).toBe(false)
    expect(isPhoneNumberString('123')).toBe(false)
    expect(isPhoneNumberString('')).toBe(false)
  })
})

describe('getNotificationTtsText - direct chats', () => {
  it('speaks emoji alert when message is pure emoji or only has punctuation with emojis', () => {
    expect(
      getNotificationTtsText({
        contact: 'Wesley',
        message: '😀'
      })
    ).toBe('Wesley enviou um emoji')

    expect(
      getNotificationTtsText({
        contact: 'Wesley',
        message: '😀 🔥'
      })
    ).toBe('Wesley enviou um emoji')

    expect(
      getNotificationTtsText({
        contact: 'Wesley',
        message: '😀!'
      })
    ).toBe('Wesley enviou um emoji')
  })

  it('reads the message with emojis stripped when it contains text and emoji', () => {
    expect(
      getNotificationTtsText({
        contact: 'Wesley',
        message: 'Oi tudo bem? 😀'
      })
    ).toBe('Wesley disse: Oi tudo bem?')

    expect(
      getNotificationTtsText({
        contact: 'Wesley',
        message: '😀 Partiu almoço'
      })
    ).toBe('Wesley disse: Partiu almoço')

    expect(
      getNotificationTtsText({
        contact: 'Wesley',
        message: 'Oi 😀 tudo bem? 🔥'
      })
    ).toBe('Wesley disse: Oi tudo bem?')
  })

  it('reads plain text messages', () => {
    expect(
      getNotificationTtsText({
        contact: 'Wesley',
        message: 'Boa tarde'
      })
    ).toBe('Wesley disse: Boa tarde')
  })

  it('announces direct media correctly', () => {
    expect(
      getNotificationTtsText({
        contact: 'Wesley',
        message: '🎙️ Áudio',
        audio: 'audio.ogg'
      })
    ).toBe('Wesley enviou um áudio')

    expect(
      getNotificationTtsText({
        contact: 'Wesley',
        message: '📷 Foto',
        image: 'img.jpg'
      })
    ).toBe('Wesley enviou uma foto')

    expect(
      getNotificationTtsText({
        contact: 'Wesley',
        message: '🎥 Vídeo',
        video: 'vid.mp4'
      })
    ).toBe('Wesley enviou um vídeo')

    expect(
      getNotificationTtsText({
        contact: 'Wesley',
        message: '📄 Documento',
        document: 'doc.pdf',
        documentName: 'contrato.pdf'
      })
    ).toBe('Wesley enviou um documento (contrato.pdf)')

    expect(
      getNotificationTtsText({
        contact: 'Wesley',
        message: '[Sticker]'
      })
    ).toBe('Wesley enviou um sticker')

    expect(
      getNotificationTtsText({
        contact: 'Wesley',
        message: '[GIF]'
      })
    ).toBe('Wesley enviou um gif')
  })

  it('handles note-to-self in direct chats', () => {
    expect(
      getNotificationTtsText({
        contact: 'Você',
        message: 'Lembrete pessoal',
        isNoteToSelf: true
      })
    ).toBe('Você enviou para si mesmo: Lembrete pessoal')

    expect(
      getNotificationTtsText({
        contact: 'Você',
        message: '🎙️ Áudio',
        audio: 'a.ogg',
        isNoteToSelf: true
      })
    ).toBe('Você enviou um áudio para si mesmo')

    expect(
      getNotificationTtsText({
        contact: 'Você',
        message: '😀',
        isNoteToSelf: true
      })
    ).toBe('Você enviou um emoji para si mesmo')
  })

  it('handles unknown phone numbers in direct chats', () => {
    expect(
      getNotificationTtsText({
        contact: '5511999990000',
        message: 'Olá'
      })
    ).toBe('Um número desconhecido disse: Olá')

    expect(
      getNotificationTtsText({
        contact: '5511999990000',
        message: '🎙️ Áudio',
        audio: 'a.ogg'
      })
    ).toBe('Um número desconhecido enviou um áudio')

    expect(
      getNotificationTtsText({
        contact: '5511999990000',
        message: '😀'
      })
    ).toBe('Um número desconhecido enviou um emoji')
  })
})

describe('getNotificationTtsText - group chats', () => {
  it('announces pure emoji as "X enviou no Y um emoji"', () => {
    expect(
      getNotificationTtsText({
        contact: 'Família',
        groupName: 'Família',
        senderName: 'Wesley',
        isGroup: true,
        message: '😀'
      })
    ).toBe('Wesley enviou no Família um emoji')
  })

  it('reads message with emoji stripped as "X enviou no Y: [mensagem]"', () => {
    expect(
      getNotificationTtsText({
        contact: 'Família',
        groupName: 'Família',
        senderName: 'Wesley',
        isGroup: true,
        message: 'Bora almoçar? 🍕'
      })
    ).toBe('Wesley enviou no Família: Bora almoçar?')
  })

  it('reads plain text in groups as "X enviou no Y: [mensagem]"', () => {
    expect(
      getNotificationTtsText({
        contact: 'Família',
        groupName: 'Família',
        senderName: 'Wesley',
        isGroup: true,
        message: 'Bom dia pessoal'
      })
    ).toBe('Wesley enviou no Família: Bom dia pessoal')
  })

  it('announces media in groups with contact and group', () => {
    expect(
      getNotificationTtsText({
        contact: 'Família',
        groupName: 'Família',
        senderName: 'Wesley',
        isGroup: true,
        message: '🎙️ Áudio',
        audio: 'a.ogg'
      })
    ).toBe('Wesley enviou no Família um áudio')

    expect(
      getNotificationTtsText({
        contact: 'Família',
        groupName: 'Família',
        senderName: 'Wesley',
        isGroup: true,
        message: '📷 Foto',
        image: 'f.jpg'
      })
    ).toBe('Wesley enviou no Família uma foto')

    expect(
      getNotificationTtsText({
        contact: 'Família',
        groupName: 'Família',
        senderName: 'Wesley',
        isGroup: true,
        message: '🎥 Vídeo',
        video: 'v.mp4'
      })
    ).toBe('Wesley enviou no Família um vídeo')

    expect(
      getNotificationTtsText({
        contact: 'Família',
        groupName: 'Família',
        senderName: 'Wesley',
        isGroup: true,
        message: '📄 Documento',
        documentName: 'relatorio.pdf'
      })
    ).toBe('Wesley enviou no Família um documento (relatorio.pdf)')

    expect(
      getNotificationTtsText({
        contact: 'Família',
        groupName: 'Família',
        senderName: 'Wesley',
        isGroup: true,
        message: '[Sticker]'
      })
    ).toBe('Wesley enviou no Família um sticker')

    expect(
      getNotificationTtsText({
        contact: 'Família',
        groupName: 'Família',
        senderName: 'Wesley',
        isGroup: true,
        message: '[GIF]'
      })
    ).toBe('Wesley enviou no Família um gif')
  })

  it('handles groups where name starts with "Grupo " naturally', () => {
    expect(
      getNotificationTtsText({
        contact: 'Grupo dos Amigos',
        groupName: 'Grupo dos Amigos',
        senderName: 'Lucas',
        isGroup: true,
        message: 'E aí galera'
      })
    ).toBe('Lucas enviou no Grupo dos Amigos: E aí galera')

    expect(
      getNotificationTtsText({
        contact: 'Grupo',
        groupName: 'Grupo',
        senderName: 'Lucas',
        isGroup: true,
        message: '😀'
      })
    ).toBe('Lucas enviou no grupo um emoji')
  })

  it('handles unknown numbers in groups', () => {
    expect(
      getNotificationTtsText({
        contact: 'Família',
        groupName: 'Família',
        senderName: '5511999990000',
        isGroup: true,
        message: 'Olá'
      })
    ).toBe('Um número desconhecido enviou no Família: Olá')
  })

  it('identifies group by contactJid ending with @g.us', () => {
    expect(
      getNotificationTtsText({
        contactJid: '120363000000000001@g.us',
        groupName: 'Trabalho',
        senderName: 'Carlos',
        message: 'Reunião em 5 minutos'
      })
    ).toBe('Carlos enviou no Trabalho: Reunião em 5 minutos')
  })
})
