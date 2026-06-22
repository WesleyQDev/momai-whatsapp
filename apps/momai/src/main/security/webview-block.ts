export function shouldBlockWebviewAttachment(): boolean {
  // Defense-in-depth: MomAI does not use <webview>. Block all attachments
  // so a future bug or malicious code can't enable one.
  return true
}
