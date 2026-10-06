# Post Your Project

[English](README.md) · **Português**

> Um plugin do Claude Code que transforma um repositório em portfólio pronto pra mostrar: README bilíngue escrito a partir do código de verdade, prints reais do projeto rodando e um rascunho de post pro LinkedIn com prévia.

![O verificador de README apontando títulos repetidos, um .env fora do .gitignore e afirmações sem respaldo num rascunho](docs/screenshots/check-readme.png)

## Sobre

A skill lê o código antes de escrever qualquer coisa, roda o projeto para capturar prints reais, gera os dois READMEs em paralelo e depois confere tudo com scripts. Porque os erros que importam num README publicado no GitHub passam fácil numa releitura: funcionalidade que não existe e comando que não roda são as maneiras mais rápidas de perder credibilidade.

Começou como ferramenta pessoal de portfólio de um dev brasileiro. Por isso português é aqui uma língua de primeira classe, não um complemento.

## Funcionalidades

- **README a partir do código, não adivinhação** — funcionalidades, stack e comandos são rastreáveis nos manifests, nas rotas e nos scripts; o que não aparece no código fica de fora
- **Dois idiomas nativos** — `README.md` em inglês e `README.pt-BR.md` escrito direto em português, cada um com a sua voz, mais um seletor de idioma nos dois
- **Prints reais** — apps web capturados no Chrome headless enquanto rodam; CLIs e scripts desenhados como saída de terminal de execuções de verdade; apps mobile do simulador
- **Verificação automática** — links e imagens quebrados, seção de licença sem arquivo LICENSE, `.env` que o README pede mas não está no `.gitignore`, e afirmações sem respaldo marcadas por linha
- **Detecção de vazamento** — segredo no texto interrompe a geração; dado pessoal e arquivo já exposto aparecem por categoria, nunca pelo valor
- **Workflow de pull request** — README vai numa branch `readme`; a skill abre o PR, prepara o post e faz uma pergunta antes de prosseguir
- **Post pro LinkedIn com prévia** — gera um rascunho na sua voz (a partir de posts que você fornece), com uma prévia privada mostrando o corte do "ver mais", contagem de caracteres e um botão de copiar pronto

## Telas

| Saída do terminal como imagem | Prévia do post do LinkedIn |
| --- | --- |
| ![Uma execução real de um comando desenhada como janela de terminal](docs/screenshots/terminal-example.png) | ![Página de prévia de um rascunho, com contagem de caracteres e observações da revisão](docs/screenshots/post-preview.png) |

## Tecnologias

- **Runtime:** Node.js (testado com Node 24)
- **Automação de browser:** Playwright (Chrome headless)
- **Scripts:** JavaScript (módulos `.mjs`)
- **Ferramentas CLI:** git, GitHub CLI (`gh`)
- **Mobile:** Simulador iOS (Xcode) ou emulador Android

## Como rodar

### Pré-requisitos

- [Claude Code](https://code.claude.com)
- Node.js 20+
- Google Chrome — ou `npm install -g playwright` para Chromium
- git e GitHub CLI (`gh`)
- Simulador iOS (Xcode) ou emulador Android para prints de app mobile

Desenvolvido e testado no macOS.

### Instalação

```
/plugin marketplace add giovaniocan/post-your-project
/plugin install post-your-project@giovaniocan
```

A skill instala a única dependência dela (`playwright-core`) dentro da própria pasta na primeira vez que você pede um print.

### Uso

Abra o Claude Code num diretório de projeto ou em qualquer pasta com link de repositório, e peça do seu jeito:

```
gera um README em inglês e português com prints do sistema
deixa esse repo bonito pro portfólio
escreve um post pro LinkedIn sobre esse projeto
write a README for this repo
```

Para posts no LinkedIn, a skill pede dois ou três posts seus na primeira vez e guarda em `~/.claude/post-your-project/voice.md`, fora do plugin, então a sua voz permanece sua.

## Como a publicação funciona

Depois que a skill abre o PR e prepara o post, você revisa e aprova. Então:

1. Para o README: revise o PR no GitHub e faça merge quando estiver satisfeito
2. Para o post do LinkedIn: a skill abre o LinkedIn no seu navegador com o post já na caixa de publicação (título em negrito, parágrafos, a linha `Link: …` e tech stack) e copia as imagens do post, numeradas, para `Downloads/linkedin-posts/<projeto>/`

Depois você:
1. Fecha o cartão do link (o X na caixa do post)
2. Clica em Mídia, navega para a pasta (ou Ctrl/Cmd+V se ela abrir em outro lugar), seleciona todas as imagens
3. Clica em Publicar

A caixa de post do LinkedIn só aceita imagem pelo botão Mídia — colar ou arrastar não funciona. O navegador reabre a janela de arquivos onde foi usada pela última vez, então repostar o mesmo projeto costuma pular a etapa de navegação.

## O que ela não faz

- **Inventar funcionalidade.** Quando não consegue rodar algo, ela avisa e pede um print em vez de adivinhar
- **Vazar segredo ou dado pessoal.** Um README que chega ao GitHub é público para sempre, e a skill trata assim
- **Agir sem permissão.** Ela faz commit do README numa branch nova e abre um PR, mas não faz merge nem publica sem o seu "sim" explícito para cada passo
- **Controlar o LinkedIn ou entrar nele.** A skill prepara o post no seu navegador e para; você cuida do último passo

## Estrutura do projeto

```
.claude-plugin/               Manifests do plugin e do marketplace
skills/post-your-project/
  SKILL.md                   As instruções detalhadas que o Claude lê e segue
  references/
    readme-template.md       Estrutura e seções que os dois READMEs usam
    linkedin-post.md         Regras de escrita do post e exemplos
  scripts/
    capture.mjs              Prints de um app web rodando
    terminal.mjs             Saída real de comando desenhada como terminal
    check-readme.mjs         Verifica os dois READMEs para links, vazamentos, afirmações
    post-preview.mjs         Gera a prévia do LinkedIn e observações de revisão
    linkedin-share.mjs       Abre o LinkedIn com o post e as imagens prontas
    linkedin-text.mjs        Utilidades de título em negrito e link
    leaks.mjs                Detecção de segredo e padrões de dado pessoal
    wording.mjs              Detecção de palavras-promessa e frases prontas
    browser.mjs              Setup compartilhado do Chrome headless
```

## Licença

Distribuída sob a licença MIT. Veja [LICENSE](LICENSE).
