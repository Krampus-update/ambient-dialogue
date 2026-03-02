# Ambient Dialogue

Módulo para Foundry VTT (v13) focado em **cenas de diálogo ambiente** com falas em bubble acima de tokens, controle de ordem de falas e movimentação por trajetória gravada.
É **agnóstico de sistema** (system agnostic).

## O que o módulo faz

- Cria e organiza cenas de diálogo por pasta.
- Permite vincular NPCs (Actor/Token) a cada cena via drag-and-drop.
- Toca falas em sequência, com opção de:
  - `Loop` da cena.
  - Fala tocar **junto com a frase anterior** (por fala).
- Suporta **trajeto gravado** por NPC:
  - grava origem + pontos de mudança de direção + ponto final.
  - aplica o trajeto em falas marcadas para usar trajeto gravado.
- Mostra preview por frase para validar movimento/fala.
- Reposiciona NPCs para origem gravada (`Ir para início`).
- API pública para integração (incluindo Monk's Active Tiles).

## Requisitos

- Foundry VTT v13.
- Monk’s Active Tiles é recomendado para automação por tile.

## Instalação

1. Copie a pasta `ambient-dialogue` para:
   - `FoundryVTT/Data/modules/ambient-dialogue`
2. Ative o módulo no mundo.

## Como usar

1. Abra **Token Controls** na barra esquerda.
2. Clique em **Ambient Dialogue**.
3. Crie uma cena (`+ Nova Cena`).
4. Arraste Tokens/Actors para a área da cena.
5. Adicione falas (`+ Fala`):
   - escolha speaker
   - texto
   - opcional: tocar junto com a anterior
   - opcional: usar/gravar trajeto
6. Use `Play` para executar e `Stop` para interromper.

## Gravação de trajeto

Dentro de adicionar/editar fala:

- marque `Gravar trajeto agora`
- salve
- mova o token
- clique `Parar gravação`

Depois, marque `Usar trajeto gravado nesta fala` para aplicar esse trajeto quando a fala tocar.

## Integração com Monk’s Active Tiles

Você pode chamar pela API:

```js
await game.modules.get("ambient-dialogue").api.trigger("Nome da Cena");
```

Ou por ID:

```js
await game.modules.get("ambient-dialogue").api.playScene("SCENE_ID");
```

Parar execução:

```js
game.modules.get("ambient-dialogue").api.stopScene();
```

## API disponível

- `api.scenes` (getter)
- `api.createScene(name)`
- `api.playScene(sceneId)`
- `api.stopScene()`
- `api.trigger(sceneRef)` (`id` ou `nome`)

## Observações

- Alterações em cena/configuração são feitas pelo GM.
- A execução de fala/movimento depende dos tokens estarem disponíveis na cena ativa.
