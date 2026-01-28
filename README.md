# Cronograma PWA (recorte do CRM)

Este app e um recorte independente do modulo `/cronograma` do CRM original.
O foco e somente o cronograma semanal e as telas diretamente relacionadas, com
dados e acoes 100% mockadas em memoria.

## O que esta incluso
- Cronograma semanal mobile-first com selecao de semana e dia.
- Lista mensal simples para contexto.
- Detalhe do agendamento com check-in, check-out e justificativa de ausencia.
- Regra de bloqueio diaria (somente o primeiro pendente do dia pode ser acionado).
- PWA em React + Vite + Tailwind.

## O que NAO esta incluso
- Autenticacao, usuarios, leads, financeiro ou qualquer outra area do CRM.
- API real, banco de dados, geolocalizacao ou camera (apenas mocks).

## Rodar localmente
```bash
npm install
npm run dev
```
