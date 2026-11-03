import twitterText from 'twitter-text';

export const X_POST_FOOTER = 'posted from mentions';
export function previewXPost(content: string) {
  const body = content.trim();
  const suffix = '\n\n' + X_POST_FOOTER;
  const text = body.endsWith(suffix) ? body : body + suffix;
  const parsed = twitterText.parseTweet(text);
  return {text, weightedLength: parsed.weightedLength, valid: Boolean(body) && parsed.valid};
}
export function formatXPost(content: string): string {
  const preview = previewXPost(content);
  if (!preview.valid) throw new Error('Your X post must fit 280 characters including the “posted from mentions” footer. Shorten the text or turn off posting to X.');
  return preview.text;
}
