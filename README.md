# Atreia Forge

Calculadora de craft de AION 2 em React e Tailwind CSS. O catálogo inclui os materiais, os resultados normais e de combo, a profissão, o nível e a facção de cada receita.

## Usar a oficina

- Busque o servidor pelo nome ou pela região, escolha a profissão e o tipo de item. Informe o estoque para calcular o custo dos materiais que faltam.
- Em **Linhas de craft**, escolha uma receita por profissão e categoria. A oficina sugere as etapas anteriores e seguintes. Você também pode carregar o exemplo do Colar de Rubi ou adicionar uma receita pela calculadora.
- A sequência 64 → 16 → 4 → 1 usa as chances de combo do jogo. É possível editar as tentativas e os combos de cada etapa. Os resultados de uma etapa abastecem a próxima, e o custo consolidado considera cada unidade do inventário uma única vez.
- Em **Etapas**, informe a **Taxa do mercado** de 0 a 100%, com até duas casas decimais. Ela começa em 0%, fica salva por servidor e acompanha a cópia da oficina. A comparação mostra o desembolso necessário, o valor dos insumos externos e a venda líquida do lote final.
- Em cada etapa, **Vender agora** mostra a venda líquida de todos os Brilhantes do lote. Para **continuar**, a oficina soma as vendas líquidas dos resultados normais, dos Brilhantes do próximo tier e dos Brilhantes que sobrarem da etapa atual. Depois desconta o valor integral dos insumos adicionais, inclusive os do estoque. A **Diferença líquida ao continuar** é esse resultado menos o líquido de vender agora.
- Para estimar a venda líquida, a oficina multiplica a quantidade de cada item pelo preço unitário e por (1 − taxa/100). Arredonda o líquido de cada lote para baixo em Kinah inteiros. As quantidades vêm dos combos planejados ou registrados.
- Verde indica que continuar rende mais, vermelho que vender agora rende mais. Em **Ver cálculo**, consulte as quantidades e os preços unitários. Quando houver um próximo tier conhecido fora da linha, ele aparece como sugestão para simular a continuação.
- Use **Registrar craft** na própria etapa para informar quantos combos obteve. Ao adicionar os resultados ao inventário, a próxima etapa que usa esses itens recebe a quantidade de tentativas correspondente. A baixa dos ingredientes e a entrada dos produtos são gravadas juntas.
- Em **Crafts salvos**, toque na receita para abrir seus materiais e ajustar as quantidades na própria lista.
- Visitantes usam a oficina local. Em **Minha conta**, contas Google convidadas podem acessar sua oficina sincronizada e o menu **Rentabilidade**. Para trazer o estoque antigo, entre com Google, abra **Minha conta → Copiar dados deste dispositivo para a conta**, confira a prévia e confirme. A cópia original continua no navegador.
- Em **Rentabilidade**, filtre por profissão, categoria, nome e facção como na calculadora. As cotações e a taxa acompanham o servidor selecionado. Ordene por lucro ou margem e toque em uma receita para abrir os materiais e as vendas dentro do ranking.
- O detalhe mostra a quantidade, o preço unitário e o subtotal de cada material. Para cada resultado, a venda média por tentativa é a chance de sair × quantidade produzida × preço unitário. A soma das vendas médias, descontada a taxa e o custo dos materiais, dá o lucro por tentativa. A margem é o lucro dividido pela venda líquida. Receitas com preços ausentes aparecem em **Faltam cotações**, onde também é possível abrir o detalhe e informar os valores.

## Executar

Use Node.js 22 e npm.

```sh
npm ci
npm run dev
```

`npm test` verifica o planejamento e as movimentações do estoque. `npm run build` gera o front-end em `dist`. `npm run preview` serve a compilação com o mesmo endpoint de mercado usado no desenvolvimento.

### Configuração do acesso por convite

A aplicação usa Google em Firebase Authentication e o Firestore do projeto `atreia-forge`. Configure a chave pública do app Web em `VITE_FIREBASE_API_KEY` antes do build (localmente em `.env.local`) e autorize o domínio em Authentication. A Vercel aplica a variável de produção no próximo deploy.

As regras em `firestore.rules` permitem ler a própria autorização e acessar somente a oficina do próprio UID. No console administrativo, cada convite é um documento `members/{email-em-minúsculas}` com o campo booleano `enabled`. Defina-o como `false` para revogar acesso. A função de rentabilidade consulta essa mesma autorização no Firestore, usando o token Firebase da sessão, a cada requisição. As regras podem ser publicadas com `firebase deploy --only firestore:rules --project atreia-forge`.

## Dados e mercado

A função da Vercel em `api/market.js` consulta o Aion2 Exchange por servidor e ID de item. A interface identifica cotações antigas, itens sem oferta e totais parciais. É possível consultar o item no Questlog e informar um preço manual para itens sem cotação. [API do Aion2 Exchange](https://aion2.exchange/api/docs)

Os dados e as traduções vêm dos registros do cliente global. Os créditos e o aviso de licença acompanham o catálogo. [Créditos e licença](public/data/NOTICE.txt)
