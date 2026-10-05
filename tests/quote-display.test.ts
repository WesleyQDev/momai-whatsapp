import { describe, expect, it } from 'vitest'
import {
  resolveQuoteSenderName,
  WHATSAPP_QUOTE_SELF_COLOR_INCOMING,
  WHATSAPP_QUOTE_SELF_COLOR_OUTGOING
} from '../src/utils/quoteDisplay'

describe('resolveQuoteSenderName (citação estilo WhatsApp Web)', () => {
  it('mostra "Você" quando a mensagem citada é sua', () => {
    expect(resolveQuoteSenderName({ from: 'Você' }, { youLabel: 'Você' })).toEqual({
      name: 'Você',
      isFromMe: true
    })
  })

  it('mostra o nome do contato quando a citada é dele', () => {
    expect(resolveQuoteSenderName({ from: 'Maria' }, { youLabel: 'Você' })).toEqual({
      name: 'Maria',
      isFromMe: false
    })
  })

  it('ignora dois-pontos da etiqueta ("Você:") no cabeçalho', () => {
    expect(resolveQuoteSenderName({ from: 'Você:' }, { youLabel: 'Você:' })).toEqual({
      name: 'Você',
      isFromMe: true
    })
    expect(resolveQuoteSenderName({ from: 'Você' }, { youLabel: 'Você:' })).toEqual({
      name: 'Você',
      isFromMe: true
    })
  })

  it('resolve pelo senderJid quando não há nome', () => {
    expect(
      resolveQuoteSenderName(
        { senderJid: '5511999990001@s.whatsapp.net' },
        { youLabel: 'Você', isOwnJid: (jid) => jid === '5511999990001@s.whatsapp.net' }
      )
    ).toEqual({ name: 'Você', isFromMe: true })
  })

  it('encontra a citada no histórico: própria mensagem sem participant => "Você"', () => {
    const findLine = (id: string) =>
      id === 'STANZA1' ? { direction: 'outgoing' as const, from: 'Você' } : undefined
    expect(
      resolveQuoteSenderName({ id: 'STANZA1' }, { youLabel: 'Você', findLine })
    ).toEqual({ name: 'Você', isFromMe: true })
  })

  it('encontra a citada no histórico: mensagem do contato => nome dele', () => {
    const findLine = (id: string) =>
      id === 'STANZA2' ? { direction: 'incoming' as const, from: 'Maria' } : undefined
    expect(
      resolveQuoteSenderName(
        { id: 'STANZA2' },
        { youLabel: 'Você', contactName: 'Maria', findLine }
      )
    ).toEqual({ name: 'Maria', isFromMe: false })
  })

  it('ignora `from` obsoleto quando a citada é sua (direção manda)', () => {
    const findLine = (id: string) =>
      id === 'STANZA3' ? { direction: 'outgoing' as const, from: 'Maria' } : undefined
    expect(
      resolveQuoteSenderName(
        { id: 'STANZA3', from: 'Maria' },
        { youLabel: 'Você', contactName: 'Maria', findLine }
      )
    ).toEqual({ name: 'Você', isFromMe: true })
  })

  it('usa o nome do contato como último recurso', () => {
    expect(
      resolveQuoteSenderName({ id: 'DESCONHECIDO' }, { youLabel: 'Você', contactName: 'Maria' })
    ).toEqual({ name: 'Maria', isFromMe: false })
  })

  it('retorna vazio quando nada identifica o autor', () => {
    expect(resolveQuoteSenderName({}, { youLabel: 'Você' })).toEqual({
      name: '',
      isFromMe: false
    })
  })
})

describe('cores da citação própria', () => {
  it('usa rosa no balão de saída, como no WhatsApp Web', () => {
    expect(WHATSAPP_QUOTE_SELF_COLOR_OUTGOING).toBe('#ff5b8f')
  })

  it('usa rosa no balão de entrada, como no WhatsApp Web', () => {
    expect(WHATSAPP_QUOTE_SELF_COLOR_INCOMING).toBe('#ff5b8f')
  })
})
