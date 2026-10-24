# CLAYSP — Portfólio

Abertura cinematográfica da marca CLAYSP e hero 3D: a Terra (imagens reais da NASA) flutua no espaço; ao rolar a página, um braço robótico preto surge do alto, agarra o planeta e o leva para fora da tela. O botão **Ver globo** leva a câmera até uma órbita baixa sobre a Terra.
Feito em HTML, CSS e JavaScript puro (WebGL2), sem bibliotecas externas.

## Como o repositório está organizado
| Caminho | O que é |
|---|---|
| `index.html` | **O site publicado.** Arquivo único, com estilos, animações, imagens e modelo 3D embutidos. É o que o Railway serve. |
| `server.js`, `package.json` | Servidor simples para o Railway (sem dependências). |
| `fonte/` | Projeto completo para editar: `index.html`, `css/`, `js/`, `assets/` e `tools/`. |

## Como publicar uma mudança
1. Edite os arquivos dentro de `fonte/`.
2. Gere o site: `python fonte/tools/embed_assets.py` e depois `python fonte/tools/build_single.py`. O segundo comando atualiza o `index.html` da raiz.
3. Faça o commit e o push para `main`. O Railway publica sozinho.

Para ver localmente: abra `index.html` (raiz) com dois cliques. Use `?semintro` no endereço para pular a abertura enquanto edita.

## O que trocar
| O quê | Onde (em `fonte/index.html`) |
|---|---|
| Número do WhatsApp | procure `55XXXXXXXXXXX` (DDI + DDD + número, só números) |
| E-mail | procure `seuemail@exemplo.com` |
| Projetos | seção `PROJETOS`: copie um bloco `<a class="project">` e troque título, tags e link |
| Textos do hero e a frase "O mundo inteiro, na palma da mão." | seção `HERO` |
| Textos da abertura ("Seja bem-vindo :)", "Criado por") | atributos `data-text` |

## Código
- `fonte/js/intro.js` — abertura (boas-vindas → Criado por → C + batida → CLAYSP letra por letra → reflexos → pulsação → queima) e a captura disparada pela rolagem para baixo.
- `fonte/js/burn.js` — transição de queima que revela o hero.
- `fonte/js/hero.js` — cena 3D: Terra, braço robótico, contato dos dedos com a esfera, câmera em órbita baixa. A sensibilidade do arraste fica em `DRAG_SENSITIVITY`.
- `fonte/js/menu.js` — menu (bolinha na seção atual) e a experiência "Ver globo", em estados separados.
- `fonte/tools/` — `export_arm.py` (converte o GLB do braço), `prepare_nasa.py` (texturas da Terra), `extract_logo.py` (recortes da logo), `embed_assets.py` e `build_single.py` (geram o site).

## Créditos
- Braço 3D: "Robotic Prosthetic Arm" de Daz (https://sketchfab.com/Darren.Hogan), licença CC BY 4.0, com materiais e poses adaptados. **O crédito no rodapé do site é obrigatório: mantenha-o.**
- Imagens da Terra: NASA (Blue Marble e Black Marble), domínio público.

## Segurança
Se algum efeito falhar, a abertura some sozinha e o site continua navegável. Quem usa "reduzir movimento" no sistema vê uma versão curta e calma.
