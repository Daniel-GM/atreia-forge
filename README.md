# Atreia Forge

Calculadora de craft de AION 2 em React e Tailwind CSS. O catálogo inclui os materiais, os resultados normais e de combo, a profissão, o nível e a facção de cada receita.

## Usar a oficina

- Escolha o servidor, a profissão e o tipo de item. Informe o estoque para calcular o custo dos materiais que faltam.
- Em **Linhas de craft**, carregue o exemplo do Colar de Rubi ou monte sua própria sequência. Você também pode adicionar uma receita à linha direto pela calculadora.
- A sequência 64 → 16 → 4 → 1 usa as chances de combo do jogo. É possível editar as tentativas e os combos de cada etapa. Os resultados de uma etapa abastecem a próxima, e o custo consolidado considera cada unidade do inventário uma única vez.
- A comparação mostra o desembolso necessário, o valor de todos os insumos externos e a cotação do lote da última etapa. As sobras das etapas anteriores aparecem separadamente. Preços expressos em Kinah, antes de taxas de venda.
- Ao registrar um craft, informe quantos combos obteve e escolha se deseja adicionar os resultados ao inventário. A baixa dos ingredientes e a entrada dos produtos são gravadas juntas.
- O estoque, as linhas e as receitas salvas ficam no navegador. Para transferi-los de dispositivo, use **Dados neste dispositivo → Exportar cópia / Importar cópia**.

## Executar

Use Node.js 22 e npm.

```sh
npm ci
npm run dev
```

`npm test` verifica o planejamento e as movimentações do estoque. `npm run build` gera o front-end em `dist`. `npm run preview` serve a compilação com o mesmo endpoint de mercado usado no desenvolvimento.

## Dados e mercado

A função da Vercel em `api/market.js` consulta o Aion2 Exchange por servidor e ID de item. A interface identifica cotações antigas, itens sem oferta e totais parciais. É possível consultar o item no Questlog e informar um preço manual para itens sem cotação. [API do Aion2 Exchange](https://aion2.exchange/api/docs)

Os dados e as traduções vêm dos registros do cliente global. Os créditos e o aviso de licença acompanham o catálogo. [Créditos e licença](public/data/NOTICE.txt)
