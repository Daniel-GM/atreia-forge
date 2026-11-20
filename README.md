# Atreia Forge

Calculadora de craft de AION 2 em React e Tailwind CSS. O catálogo inclui os materiais, os resultados normais e de combo, a profissão, o nível e a facção de cada receita.

## Usar a oficina

- Busque o servidor pelo nome ou pela região, escolha a profissão e o tipo de item. Informe o estoque para calcular o custo dos materiais que faltam.
- Em **Linhas de craft**, escolha uma receita por profissão e categoria. A oficina sugere as etapas anteriores e seguintes. Você também pode carregar o exemplo do Colar de Rubi ou adicionar uma receita pela calculadora.
- A sequência 64 → 16 → 4 → 1 usa as chances de combo do jogo. É possível editar as tentativas e os combos de cada etapa. Os resultados de uma etapa abastecem a próxima, e o custo consolidado considera cada unidade do inventário uma única vez.
- A comparação mostra o desembolso necessário, o valor de todos os insumos externos e a cotação do lote da última etapa. As sobras das etapas anteriores aparecem separadamente. Preços expressos em Kinah, antes de taxas de venda.
- Em cada etapa, **Vender agora** mostra quanto renderia a venda dos Brilhantes. A **Diferença ao continuar** parte do valor de venda dos resultados normais e de combo do próximo lote e desconta os insumos adicionais e o valor de venda dos Brilhantes consumidos. Os Brilhantes que sobram podem ser vendidos em ambas as opções. O cálculo usa os combos planejados ou registrados e os preços do servidor, inclusive para materiais já em estoque.
- Verde indica que continuar rende mais, vermelho que vender agora rende mais. Em **Ver cálculo**, consulte as quantidades e os preços unitários. Quando houver um próximo tier conhecido fora da linha, ele aparece como sugestão para simular a continuação.
- Use **Registrar craft** na própria etapa para informar quantos combos obteve. Ao adicionar os resultados ao inventário, a próxima etapa que usa esses itens recebe a quantidade de tentativas correspondente. A baixa dos ingredientes e a entrada dos produtos são gravadas juntas.
- Em **Crafts salvos**, toque na receita para abrir seus materiais e ajustar as quantidades na própria lista.
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
