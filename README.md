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
| — | **Extrato** — cada movimento com o saldo e o CMP logo depois |
| — | **Pendências** — saldos negativos e vendas sem valor |
| — | **Histórico** — quem lançou/alterou o quê e quando |

Os simuladores (Bumerangue e CI) ficaram de fora desta versão.

### Diferenças importantes em relação à planilha

- **O CMP é calculado sozinho**, pelo custo médio ponderado, em ordem de data.
  Na planilha o "CMP na Operação" das vendas era digitado à mão (uma venda de
  336 mil Smiles estava com CMP R$ 0,00 e aparecia como R$ 5.040 de lucro).
- **O CMP considera só os pontos que ainda estão na conta.** Na planilha ele era
  a média de tudo o que já entrou, inclusive o que já foi vendido.
- **Não dá para gastar pontos que não existem.** Uma venda ou transferência
  maior que o saldo (na data dela) é recusada com uma mensagem explicando.
- **Sem limite de linhas.** As fórmulas da planilha só liam até a linha ~1000.
- **Senhas dos programas não são guardadas.** Use um gerenciador de senhas.

## Perfis de acesso

- **Administrador**: tudo, mais cadastrar usuários, importar a planilha e ver o histórico.
- **Operador**: lançamentos e cadastros.

O primeiro acesso (banco vazio) abre a tela de criação do administrador.

---

## Publicar na internet (Vercel + Neon, plano gratuito)

Você vai precisar de uma conta na **Vercel** (onde o site fica) — o banco de
dados **Neon** é criado de dentro da própria Vercel.

1. Entre em <https://vercel.com> e clique em **Sign Up** → **Continue with GitHub**.
2. No painel da Vercel clique em **Add New… → Project**, encontre o repositório
   **Trip** e clique em **Import**.
3. Não mude nada nas configurações e clique em **Deploy**. A primeira tentativa
   vai **falhar** porque ainda não existe banco de dados — é normal.
4. No projeto, abra a aba **Storage** → **Create Database** → escolha **Neon**
   (Serverless Postgres) → **Continue**. Aceite o plano gratuito, escolha a
   região **São Paulo (sa-east-1)** se aparecer, e confirme.
   Na tela seguinte deixe marcados os ambientes e clique em **Connect**.
   Isso cria sozinho as variáveis `DATABASE_URL` e `DATABASE_URL_UNPOOLED`.
5. Vá na aba **Deployments**, clique nos três pontinhos do último deploy →
   **Redeploy**. Agora vai dar certo (as tabelas são criadas automaticamente).
6. Clique em **Visit** para abrir o endereço do site. Crie o administrador.
7. No menu, **Importar planilha** → escolha o arquivo `.xlsx` → confira → **Confirmar**.
8. Em **Usuários**, cadastre as outras pessoas da equipe e passe a elas o
   endereço do site, o e-mail e a senha inicial.

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

- `src/lib/carteira.ts` — saldos e CMP (custo médio ponderado)
- `src/lib/fluxo.ts` — fluxo de caixa mensal
- `src/lib/importacao/planilha.ts` — leitura da planilha
- `prisma/schema.prisma` — tabelas do banco
- `src/app/(app)/…` — as telas
