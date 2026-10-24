# CLAYSP — Portfólio

Abertura cinematográfica da marca + hero 3D (mão humana que agarra a Terra ao rolar a página).
Sem bibliotecas externas: tudo é HTML, CSS e JavaScript puro (WebGL2).

## Ver no seu computador
Dê dois cliques em `index.html`. Funciona sem instalar nada.

Dica: abra `index.html?semintro` para pular a abertura enquanto edita.

## Colocar no ar (GitHub + Railway)
1. Crie um repositório no GitHub e envie **todos** os arquivos desta pasta (pode arrastar a pasta no site do GitHub, em "Add file → Upload files").
2. No Railway: **New Project → Deploy from GitHub repo** → escolha o repositório.
3. O Railway detecta o `package.json` e roda `npm start` sozinho.
4. Em **Settings → Networking → Generate Domain**, gere o link do site (ou conecte o seu domínio).

## O que trocar
| O quê | Onde |
|---|---|
| Número do WhatsApp | `index.html`, procure `55XXXXXXXXXXX` (DDI + DDD + número, só números) |
| E-mail | `index.html`, procure `seuemail@exemplo.com` |
| Projetos | `index.html`, seção `PROJETOS` — copie um bloco `<a class="project">`, troque título, tags e link; a imagem vai em `assets/projetos/` |
| Textos do hero e da frase "O mundo inteiro, na palma da mão." | `index.html`, seção `HERO` |
| Textos da abertura ("Seja bem-vindo :)", "Criado por") | `index.html`, atributos `data-text` |

## Estrutura
- `js/intro.js` — ordem da abertura (linha vermelha → boas-vindas → Criado por → C + batida → CLAYSP letra por letra → reflexos → pulsação → queima)
- `js/burn.js` — transição de queima que revela o hero
- `js/hero.js` — cena 3D (mão, Terra, luzes, sequência do scroll)
- `assets/` — peças da logo recortadas da imagem original, texturas da Terra e a malha da mão
- `tools/` — scripts Python que geraram a mão (`gen_hand.py`), a Terra (`gen_earth.py`) e os recortes da logo (`extract_logo.py`). Depois de mudar algo em `assets/`, rode `python tools/embed_assets.py`.

## Segurança
Se qualquer efeito falhar, a abertura some sozinha e o site continua navegável. Quem usa "reduzir movimento" no sistema vê uma versão curta e calma.
