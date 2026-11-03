import twitterText from 'twitter-text';

export const X_POST_FOOTER = 'posted from mentions';
export function previewXPost(content: string, hasMedia = false) {
  const body = content.trim();
  const suffix = '\n\n' + X_POST_FOOTER;
  const text = !body && hasMedia ? X_POST_FOOTER : body.endsWith(suffix) ? body : body + suffix;
  const parsed = twitterText.parseTweet(text);
  return {text, weightedLength: parsed.weightedLength, valid: (Boolean(body) || hasMedia) && parsed.valid};
}
export function formatXPost(content: string, hasMedia = false): string {
  const preview = previewXPost(content, hasMedia);
  if (!preview.valid) throw new Error('Your X post must fit 280 characters including the “posted from mentions” footer. Shorten the text or turn off posting to X.');
  return preview.text;
}
