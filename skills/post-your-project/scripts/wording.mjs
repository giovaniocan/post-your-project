// Word lists shared by check-readme.mjs and post-preview.mjs. In test runs the
// claims that slipped past a careful reread were always one of these words, so
// both texts are held to the same list.

const PROMISE_TERMS = [
  'production(?:-ready)?', 'scal(?:e|es|able|ability)', 'thousands', 'millions', 'enterprise(?:-grade)?',
  'real-time', 'blazing', 'lightning', 'robust', 'seamless(?:ly)?', 'complete', 'full-featured',
  'powerful', 'ideal', 'best', 'secure', 'revolutionary', 'cutting-edge', 'state-of-the-art',
  'produção', 'escal(?:a|ável|abilidade)', 'milhares', 'milhões', 'tempo real', 'complet[oa]',
  'robust[oa]', 'poderos[oa]', 'segur[oa]', 'revolucionári[oa]',
  // Usually false in the absolute: a free tier is still a cost ceiling.
  'zero custo', 'custo zero', 'zero cost',
];

export const PROMISE_WORDS = new RegExp(`\\b(${PROMISE_TERMS.join('|')})\\b`, 'giu');

// Openers and closers that make a LinkedIn post read as generated. Matched
// case-insensitively anywhere in the text.
const CLICHE_TERMS = [
  'estou (?:muito )?(?:feliz|animad[oa]|empolgad[oa]) em (?:compartilhar|anunciar)',
  'é com (?:muita|grande) (?:alegria|satisfação)',
  'tenho o prazer de',
  'no mundo (?:atual|de hoje)',
  'nos dias de hoje',
  'divisor de águas',
  'mudou o jogo',
  'comente ["“]?eu quero',
  'bora(?: lá)?[!.]',
  'mergulh(?:ar|ei|amos|ando)',
  'jornada',
  'não é só [^.\\n]{1,60}, é',
  "it'?s not just [^.\\n]{1,60}, it'?s",
  "(?:i'm|i am) (?:so )?(?:thrilled|excited|happy|proud) to (?:share|announce)",
  'excited to share',
  'game[- ]changer',
  "in today'?s (?:fast-paced )?world",
  'unlock(?:ing)? the (?:power|potential)',
  'dive (?:deep )?into',
  'let that sink in',
  "let'?s connect",
  'thoughts\\?$',
];

export const CLICHES = new RegExp(`(${CLICHE_TERMS.join('|')})`, 'gimu');

export function matchesOf(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? match[0]);
}
