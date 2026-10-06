// How a post's text becomes what LinkedIn shows. Shared by post-preview.mjs
// and linkedin-share.mjs, so the preview page and the text that opens in
// LinkedIn can never differ.

// LinkedIn's share link opens the composer with this text filled in. It is
// not an official API: if it stops working, the preview's copy button still
// does.
const SHARE_URL = 'https://www.linkedin.com/feed/?shareActive=true&text=';

// Mathematical Sans-Serif Bold: the "bold" LinkedIn readers see. Accented
// letters have no bold form, so they are split (NFD), the base letter is
// converted and the accent is put back on it.
export function toUnicodeBold(text) {
  const bold = [...text.normalize('NFD')].map((character) => {
    const code = character.codePointAt(0);
    if (character >= 'A' && character <= 'Z') return String.fromCodePoint(0x1d5d4 + code - 65);
    if (character >= 'a' && character <= 'z') return String.fromCodePoint(0x1d5ee + code - 97);
    if (character >= '0' && character <= '9') return String.fromCodePoint(0x1d7ec + code - 48);
    return character;
  });
  return bold.join('').normalize('NFC');
}

export function withBoldTitle(text) {
  const [title, ...rest] = text.split('\n');
  return [toUnicodeBold(title), ...rest].join('\n');
}

export function shareUrl(text) {
  return SHARE_URL + encodeURIComponent(text);
}
