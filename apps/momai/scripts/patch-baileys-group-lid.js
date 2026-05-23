/**
 * Patches @whiskeysockets/baileys group send path for LID participants.
 * Without this, SKDM targets wrong JIDs → "No sessions" / "Aguardando mensagem".
 * Idempotent — safe to run on every postinstall.
 */
const fs = require('node:fs')
const path = require('node:path')

const MARKER = '/* momai: group-lid-patch */'
const targetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@whiskeysockets',
  'baileys',
  'lib',
  'Socket',
  'messages-send.js'
)

function fail(msg) {
  console.warn(`[patch-baileys] ${msg}`)
  process.exit(0)
}

if (!fs.existsSync(targetPath)) {
  fail('baileys not installed, skipping')
}

let code = fs.readFileSync(targetPath, 'utf8')

const brokenGroupMeId =
  'const groupMeId = participantsUseLid && ((_m = authState.creds.me) === null || _m === void 0 ? void 0 : _m.lid) ? authState.creds.me.lid : meId;'
const fixedGroupMeId =
  'const groupMeId = participantsUseLid && authState.creds.me && authState.creds.me.lid ? authState.creds.me.lid : meId;'

if (code.includes(brokenGroupMeId)) {
  code = code.replace(brokenGroupMeId, fixedGroupMeId)
  fs.writeFileSync(targetPath, code, 'utf8')
  console.log('[patch-baileys] Fixed groupMeId strict-mode bug (_m is not defined)')
  process.exit(0)
}

if (code.includes(MARKER)) {
  console.log('[patch-baileys] group LID patch already applied')
  process.exit(0)
}

const oldBlock1 = `                if (!participant) {
                    const participantsList = (groupData && !isStatus) ? groupData.participants.map(p => p.id) : [];
                    if (isStatus && statusJidList) {
                        participantsList.push(...statusJidList);
                    }
                    const additionalDevices = await getUSyncDevices(participantsList, !!useUserDevicesCache, false);
                    devices.push(...additionalDevices);
                }
                const patched = await patchMessageBeforeSending(message, devices.map(d => (0, WABinary_1.jidEncode)(d.user, isLid ? 'lid' : 's.whatsapp.net', d.device)));`

const newBlock1 = `                ${MARKER}
                let participantsUseLid = false;
                if (!participant) {
                    const participantsList = (groupData && !isStatus) ? groupData.participants.map(p => p.id) : [];
                    participantsUseLid = participantsList.some((p) => p.endsWith('@lid'));
                    if (isStatus && statusJidList) {
                        participantsList.push(...statusJidList);
                    }
                    const additionalDevices = await getUSyncDevices(participantsList, !!useUserDevicesCache, false);
                    devices.push(...additionalDevices);
                }
                const participantServer = (isLid || participantsUseLid) ? 'lid' : 's.whatsapp.net';
                const patched = await patchMessageBeforeSending(message, devices.map(d => (0, WABinary_1.jidEncode)(d.user, participantServer, d.device)));`

if (!code.includes(oldBlock1)) {
  fail('unexpected baileys messages-send.js (block 1), skipping')
}
code = code.replace(oldBlock1, newBlock1)

const oldLoop = `                for (const { user, device } of devices) {
                    const jid = (0, WABinary_1.jidEncode)(user, isLid ? 'lid' : 's.whatsapp.net', device);
                    if (!senderKeyMap[jid] || !!participant) {`

const newLoop = `                for (const { user, device } of devices) {
                    const jid = (0, WABinary_1.jidEncode)(user, participantServer, device);
                    if (!senderKeyMap[jid] || !!participant) {`

if (!code.includes(oldLoop)) {
  fail('unexpected baileys messages-send.js (block 2), skipping')
}
code = code.replace(oldLoop, newLoop)

const oldEncrypt = `                const { ciphertext, senderKeyDistributionMessage } = await signalRepository.encryptGroupMessage({
                    group: destinationJid,
                    data: bytes,
                    meId,
                });`

const newEncrypt = `                const groupMeId = participantsUseLid && authState.creds.me && authState.creds.me.lid ? authState.creds.me.lid : meId;
                const { ciphertext, senderKeyDistributionMessage } = await signalRepository.encryptGroupMessage({
                    group: destinationJid,
                    data: bytes,
                    meId: groupMeId,
                });`

if (!code.includes(oldEncrypt)) {
  fail('unexpected baileys messages-send.js (block 3), skipping')
}
code = code.replace(oldEncrypt, newEncrypt)

fs.writeFileSync(targetPath, code, 'utf8')
console.log('[patch-baileys] Applied group LID patch to baileys')
