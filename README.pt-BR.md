# Post Your Project

[English](README.md) · **Português**

> Um plugin do Claude Code que deixa um repositório pronto para mostrar: README em inglês e em português escrito a partir do código de verdade, prints do projeto rodando e um rascunho de post para o LinkedIn.

![O verificador de README apontando títulos repetidos, um .env fora do .gitignore e afirmações sem respaldo num rascunho](docs/screenshots/check-readme.png)

## Sobre

Peça ao Claude Code para "deixar esse repo apresentável" e a skill assume. Ela lê o código antes de escrever qualquer coisa, roda o projeto para tirar prints reais, escreve os dois READMEs e depois confere tudo com scripts. Os erros que importam num README público passam fácil numa releitura: uma funcionalidade que não existe, um comando que não roda, uma chave ou um telefone que nunca deveriam ter sido publicados.

Começou como ferramenta pessoal para os projetos de portfólio de um dev brasileiro, e por isso o segundo idioma é o português.

## Funcionalidades

- **README a partir do código** — funcionalidades, stack e comandos saem dos manifests, das rotas e dos scripts; o que não dá para ligar a um arquivo fica de fora.
- **Dois idiomas** — `README.md` em inglês e `README.pt-BR.md` escrito direto em português, não traduzido, com seletor de idioma.
- **Prints reais** — apps web são capturados no Chrome headless enquanto rodam; CLIs, scripts e backends ganham a saída de uma execução real desenhada como janela de terminal; apps mobile são capturados no simulador.
- **Checagens automáticas** — links e imagens quebrados, seção de licença sem arquivo LICENSE, arquivos que um comando espera e não estão no repositório, um `.env` pedido pelo README que o `.gitignore` não cobre, e palavras de promessa como "production-ready" ou "scalable", cada uma com a linha.
- **Checagem de vazamento** — segredo no texto interrompe a geração; dado pessoal e arquivo já exposto no repositório aparecem pelo tipo, nunca pelo valor.
- **Rascunho de post para o LinkedIn** — pergunta o idioma a cada vez, escreve com a sua voz a partir de posts que você fornece e abre uma prévia privada com o corte do "ver mais", a contagem de caracteres e um botão de copiar.

## Telas

| Saída do terminal como imagem | Prévia do post do LinkedIn |
| --- | --- |
| ![Uma execução real de um script Python desenhada como janela de terminal](docs/screenshots/terminal-example.png) | ![Página de prévia de um rascunho de exemplo, com contagem de caracteres e observações da revisão](docs/screenshots/post-preview.png) |

## Como rodar

### Pré-requisitos

- [Claude Code](https://code.claude.com)
- Node.js (testado com o Node 24)
- Google Chrome — ou o Chromium do Playwright, com `npx playwright install chromium`
- git, e o GitHub CLI (`gh`) quando você passar uma URL do GitHub
- Para prints de app mobile, um simulador iOS (Xcode) ou emulador Android

Desenvolvido e testado no macOS.

### Instalação

No Claude Code:

```
/plugin marketplace add giovaniocan/post-your-project
/plugin install post-your-project@giovaniocan
```

A skill instala a única dependência dela (`playwright-core`) dentro da própria pasta na primeira vez que tira um print.

### Uso

Abra o Claude Code num projeto, ou em qualquer pasta com uma URL do GitHub, e peça do seu jeito:

- "gera um README em inglês e português com prints do sistema"
- "deixa esse repo bonito pro portfólio"
- "escreve um post pro LinkedIn sobre esse projeto"
- "write a README for github.com/user/repo"

Para o post do LinkedIn, na primeira vez a skill pede dois ou três posts seus e guarda em `~/.claude/post-your-project/voice.md`, fora do plugin, então os seus posts nunca são compartilhados junto com ele.

## O que ela não faz

- Inventar funcionalidade, comando ou print. Quando não consegue rodar algo, ela avisa e pede o print para você.
- Colocar segredo, ID, dado pessoal ou de cliente no README, nas imagens ou no post.
- Fazer commit, push ou apagar arquivo sem perguntar.
- Postar no LinkedIn. Você copia o texto da prévia e posta.

## Estrutura do projeto

```
.claude-plugin/          manifests do plugin e do marketplace
skills/post-your-project/
  SKILL.md               as instruções que o Claude segue
  references/            modelo de README e guia de escrita do LinkedIn
  scripts/
    capture.mjs          prints de um app web rodando
    terminal.mjs         a saída de um comando real desenhada como terminal
    check-readme.mjs     confere os dois READMEs antes da entrega
    post-preview.mjs     página de prévia do LinkedIn e revisão do texto
    leaks.mjs            padrões de segredo e de dado pessoal
    wording.mjs          palavras de promessa e frases prontas
    browser.mjs          inicialização compartilhada do Chrome headless
```

## Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE).
