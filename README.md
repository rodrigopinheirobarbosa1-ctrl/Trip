# Trip — controle de milhas e pontos

Aplicação web que substitui a planilha de milhas ("Milhas 2026"). Várias pessoas
acessam ao mesmo tempo, cada uma com o seu login.

## O que ela faz

| Na planilha | Na aplicação |
|---|---|
| Cadastros | **Pessoas (CPFs)**, **Programas** e **Cartões** — logins dos programas sem as senhas |
| Lança Entrada Ptos | **Entradas** — compras, acúmulos, bônus, saldos iniciais, parcelamento no cartão |
| Lança Transf Ptos | **Transferências** — com bônus ou deságio; o custo vai junto para o destino |
| Lança Saída Ptos + Controle de Venda | **Emissões e vendas** — lançadas uma vez só; baixa os pontos e calcula o lucro |
| E\|S Financeiras | **Entradas e saídas avulsas** |
| Fluxo de Caixa | **Fluxo de caixa** — mês a mês, com as parcelas |
| Dashboard / Resumo | **Painel** — todas as pessoas juntas ou uma de cada vez |
| — | **Importar extrato** — a IA lê os prints/PDF/Word do extrato de um programa; você confere e grava. O PDF do extrato da Smiles é lido sem IA (sem custo) |
| — | **Lotes** — cada compra/bônus/transferência com o seu custo e o que resta dela |
| — | **Extrato** — cada movimento com o saldo e o CMP logo depois |
| — | **Pendências** — saldos negativos e vendas sem valor |
| — | **Histórico** — quem lançou/alterou o quê e quando |

Os simuladores (Bumerangue e CI) ficaram de fora desta versão.

### Diferenças importantes em relação à planilha

- **O CMP é calculado sozinho**, pelo método **PEPS** (primeiro que entra, primeiro que sai).
  Cada compra, bônus ou transferência recebida vira um **lote** com o seu custo, e cada
  venda usa primeiro os lotes mais antigos. Uma promoção barata e uma compra cara não se
  misturam numa média. A tela **Lotes** mostra cada lote e quanto ainda resta dele.
  Na planilha o "CMP na Operação" das vendas era digitado à mão (uma venda de
  336 mil Smiles estava com CMP R$ 0,00 e aparecia como R$ 5.040 de lucro).
- **Transferência imediata** ("Pontos + Dinheiro" da Livelo): os pontos comprados na hora para
  completar a transferência saem primeiro, e o destino recebe o custo real da operação. Na
  importação do extrato, a linha vira compra + transferência; à mão, marque a caixinha
  "Transferência imediata" na transferência (lançando a compra antes, em Entradas).
- **CMP recente**: o painel mostra quanto custou cada milheiro que entrou nos últimos
  30, 90, 180 ou 365 dias — a referência para decidir o preço de venda.
- **Não dá para gastar pontos que não existem.** Uma venda ou transferência
  maior que o saldo (na data dela) é recusada com uma mensagem explicando.
- **Sem limite de linhas.** As fórmulas da planilha só liam até a linha ~1000.
- **Senhas dos programas não são guardadas.** Use um gerenciador de senhas.

## Perfis de acesso

- **Administrador**: tudo, mais cadastrar usuários, importar a planilha e ver o histórico.
- **Operador**: lançamentos e cadastros.

O primeiro acesso (banco vazio) abre a tela de criação do administrador.

---

## Publicar na internet (Vercel, plano gratuito)

1. Entre em <https://vercel.com> e clique em **Sign Up** → **Continue with GitHub**.
2. Em **Import Git Repository**, clique em **Install** e dê acesso ao repositório **Trip**.
3. Clique em **Import** ao lado de **Trip** e depois em **Create Project** (sem mudar nada).
4. Em **Optional Integrations**, clique em **Add** ao lado de **Prisma Postgres**
   (ou, depois, na aba **Storage** do projeto, crie um banco **Neon** ou **Prisma Postgres**).
   Escolha o plano gratuito e a região mais perto (São Paulo, se houver) e confirme.
   As variáveis do banco são criadas sozinhas — o projeto entende os nomes de qualquer um deles.
5. Clique em **Deploy**. As tabelas são criadas automaticamente.
   (Se o deploy tiver sido feito antes de conectar o banco, ele falha: conecte o banco e
   use **Deployments → ⋯ → Redeploy**.)
6. Abra o endereço do site e crie o administrador.
7. No menu, **Importar planilha** → escolha o arquivo `.xlsx` → confira → **Confirmar**.
8. Em **Usuários**, cadastre as outras pessoas da equipe e passe a elas o
   endereço do site, o e-mail e a senha inicial.

### Ligar a leitura automática de extratos (IA)

A tela **Importar extrato** usa o Claude, da Anthropic, para ler os prints. É cobrado por uso:
cada página de extrato custa poucos centavos.

1. Entre em <https://console.anthropic.com> e crie uma conta.
2. Em **Billing** (Cobrança), adicione créditos (o mínimo é cerca de US$ 5 e dura muito tempo).
3. Em **API Keys**, clique em **Create Key**, dê o nome `trip` e copie a chave (começa com `sk-ant-`).
   Ela só aparece uma vez.
4. Na Vercel, abra o projeto → **Settings** → **Environment Variables** → **Add**:
   nome `ANTHROPIC_API_KEY`, valor = a chave copiada, ambientes **Production** e **Preview** → **Save**.
5. Em **Deployments**, no último deploy: **⋯ → Redeploy**.

Toda alteração enviada ao GitHub (branch principal) é publicada sozinha pela Vercel.

---

## Rodar no computador (para desenvolvimento)

Precisa de Node.js 22 e de um PostgreSQL.

```bash
npm install
npm run dev        # cria o .env, as tabelas e abre em http://localhost:3000
npm test           # testes dos cálculos (CMP, saldos, fluxo de caixa)
npm run typecheck  # confere os tipos do código
```

Ajuste o endereço do banco no arquivo `.env` (o modelo está em `.env.example`).

### Onde fica cada coisa

- `src/lib/carteira.ts` — saldos, lotes e CMP (método PEPS) e CMP recente
- `src/lib/fluxo.ts` — fluxo de caixa mensal
- `src/lib/importacao/planilha.ts` — leitura da planilha
- `src/lib/extrato/` — leitura de extratos com IA e sugestão de cada linha
- `prisma/schema.prisma` — tabelas do banco
- `src/app/(app)/…` — as telas
