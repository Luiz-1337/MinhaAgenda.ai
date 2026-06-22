# Validação — Manual de Treinamento da Cathe (Salão Cris Ferreira)

> Backlog gerado a partir do cruzamento entre o **Manual de Treinamento: Operação de Agendamentos minhaAgenda.ai** e o sistema real (prompt do agente, dados e código).
>
> - **Data da validação:** 2026-06-04
> - **Salão validado:** `Spettacolo Salone` (`salon_id = 0e5d76eb-3e1e-4463-bc30-8d3aba663b81`)
> - **Agente:** `Cathe` (`is_active = true`, `tone = informal`, `model = gpt-5.4-mini`)
> - **Fontes cruzadas:** `agents.system_prompt` · tabelas `services` / `availability` / `salons.settings` · código do pipeline de IA e do outbound.

## Legenda

| Marca | Significado |
|---|---|
| ✅ | Já corrigido nesta rodada |
| 🟥 | Bug de código — correção pontual |
| 🟧 | Dado / configuração |
| 🟦 | Disponibilidade — gap de produto |
| 🟪 | Multi-unidade — gap de produto |
| 🟫 | Mensagens outbound |
| 🟨 | Robustez — regra só no prompt, sem enforcement |
| ⚪ | A verificar |

---

## ✅ Já corrigido (commits desta sessão)

| Item | Commit |
|---|---|
| Erro de tool interna sequestrava a resposta ao cliente | `42aebf0` |
| `setChatKanbanColumn` era chamado mesmo com kanban-IA desligado | `42aebf0` |
| `id:undefined` no resumo de tools persistido | `42aebf0` |
| Instância Evolution órfã (404) travava a reconexão | `78e3baa` |

---

## 🟥 Bugs de código — correção pontual

### 1. Resumo de tools mostra `R$0` para serviços com preço em faixa
- **O quê:** em `summarizeToolResult`, a linha do `getServices` usa `s.price` (=0 quando `price_type='range'`) em vez de `s.priceFormatted`.
- **Por quê:** ao vivo o bot vê o range correto (`priceFormatted: "R$ 280,00 - R$ 320,00"`), mas no **turno seguinte** ele relê o bloco `---TOOL_CONTEXT---` do histórico, onde está gravado `R$0` → risco de cotar errado depois. Mesma família do bug do `id` já corrigido.
- **Como:** `apps/web/lib/services/ai/generate-response.service.ts` (~linha 755) — trocar `R$${s.price}` por `${s.priceFormatted ?? 'R$'+s.price}`. One-liner.
- **Esforço:** trivial.

### 2. Chat do dashboard ignora faixa de preço por completo
- **O quê:** `ServicesToolFactory` faz `select { name, description, duration, price }` cru — sem `priceFormatted`, sem `price_min/max`, sem `price_type`.
- **Por quê:** nesse caminho (chat interno do painel) a IA vê `price=0` e cotaria "grátis" para Coloração de Raiz / Reflexo / Selagem. É bug real, só não é o caminho do WhatsApp.
- **Como:** `apps/web/lib/services/ai/tools/services-tool-factory.service.ts` — incluir `priceType/priceMin/priceMax` no select e formatar a faixa, idealmente reusando a lógica de `Service.formatPrice()` em vez de duplicar.
- **Esforço:** baixo.

### 3. "Bloqueio de Horário" aparece como serviço agendável
- **O quê:** serviço com `is_active=true`, `R$0`, `1440min` — é mecanismo interno de bloquear agenda, mas entra no resultado do `getServices`.
- **Por quê:** a IA pode listá-lo/oferecê-lo ao cliente ("temos Bloqueio de Horário por R$0").
- **Como:** investigar **antes** como ele é criado/usado (pra não quebrar o bloqueio interno) e então excluí-lo da listagem ao cliente — via flag (`is_internal` / novo `price_type`) no `GetServicesUseCase`/presenter, ou filtro por nome.
- **Esforço:** baixo a médio (depende da investigação).

---

## 🟧 Dados / configuração

### 4. Tolerância de atraso divergente (10 vs 15)
- **O quê:** `salons.settings.late_tolerance_minutes = 10`; manual e prompt da Cathe dizem **15**.
- **Por quê:** o prompt-base injeta "Tolerância: 10 minutos" e o prompt do agente diz "15" — **contradição** que o modelo lê junta.
- **Como:** `UPDATE salons SET settings = jsonb_set(settings,'{late_tolerance_minutes}','15') WHERE id='0e5d76eb-3e1e-4463-bc30-8d3aba663b81';` (ou pelo painel). Write em produção → exige OK.
- **Esforço:** trivial.

### 5. "Coloração Cabelo Todo" como `fixed` R$1
- **O quê:** o serviço é "sob avaliação", mas está `price_type='fixed'`, `price=1`.
- **Por quê:** o bot cotaria literalmente **"R$ 1,00"**.
- **Como:** não existe um `price_type` "sob avaliação". Curto prazo: ajustar `description` + instruir o bot a dizer "valor sob avaliação". Médio prazo: criar um tipo de preço "sob avaliação" tratado em `Service.formatPrice()`/presenter.
- **Esforço:** baixo (curto prazo) / médio (estrutural).

> **Nota:** os preços em **faixa** (Coloração de Raiz 280–320, Reflexo/Mechas/Luzes 1.400–1.600, Selagem/Progressiva 600–800) **estão corretos** no banco — `price_type='range'` com `price_min`/`price_max` preenchidos. Não precisam de correção de dados; o problema era de código (itens 1 e 2).

---

## 🟦 Disponibilidade — gap de produto

### 6. Não existe disponibilidade por serviço (dias + slots fixos)
- **O quê:** o manual define dias e horários *por serviço* (ex.: Corte só Ter/Qua/Sex/Sáb em 9:30, 15, 15:30…); o sistema só tem horário de trabalho *por profissional* (seg–sex 9-18).
- **Por quê:** a IA ofereceu Corte numa **segunda-feira** (o `checkAvailability` de 08/06 provou) — viola o manual.
- **Como:** feature de "disponibilidade por serviço" (vínculo serviço → dias/slots) + o motor de availability respeitando isso. Mudança estrutural.
- **Esforço:** alto.

### 7. Sábado e dias de atendimento da Cris
- **O quê:** `availability` = dias 1–5 (seg–sex). Manual: atende **sábado** (Aclimação) e centra em Ter–Sáb (segunda não aparece nos serviços).
- **Por quê:** cliente pede sábado → "sem horário"; e segunda aparece quando não deveria.
- **Como:** decisão de negócio (ela atende sábado?) → ajustar linhas de `availability` (adicionar dia 6, revisar dia 1). Ligado ao item 8.
- **Esforço:** baixo (dado) — mas depende de decisão.

---

## 🟪 Multi-unidade — gap de produto

### 8. Duas unidades não existem no modelo de dados
- **O quê:** o manual tem Campo Belo (Ter–Sex) e Aclimação (Sáb), com link do Maps e "consultar o calendário da semana". O salão tem **um único `address`** (o da Aclimação: R. Cel. Diogo, 364).
- **Por quê:** a IA fala das unidades só pelo texto do prompt — sem respaldo no sistema. Pode mandar o cliente pra unidade errada; o link do Maps e o split por dia não têm base de dados.
- **Como:** modelar unidades (tabela `units` + vínculo agendamento→unidade + alocação por dia/semana). Feature grande. Curto prazo: alinhar o endereço único e decidir se o discurso de 2 unidades fica ou sai do prompt até existir suporte.
- **Esforço:** alto.

---

## 🟫 Mensagens outbound

### 9. Lembrete de 24h não segue o manual nem a persona
- **O quê:** template genérico hardcoded ("Olá… responda CONFIRMAR/CANCELAR ✨"). Sem unidade/endereço, sem Maps, sem "atraso 15min", sem "confirme em até 1h", sem persona Cathe, sem assinatura.
- **Por quê:** quebra a identidade da marca e omite regras que o manual exige na confirmação (R5.2).
- **Como:** reescrever o `messageBody` em `apps/web/lib/services/reminders.service.ts` (~linha 95) seguindo o script do manual (unidade/endereço/Maps/15min/1h/assinatura). Depende parcialmente do item 8 para a unidade correta.
- **Esforço:** baixo (texto) — médio se exigir unidade real.

### 10. Janela de 1h sem liberação automática do slot
- **O quê:** o lembrete pede confirmação em 1h, mas **nenhum job** libera/cancela o agendamento não confirmado (R4.6).
- **Por quê:** a regra do manual não acontece — slots ficam presos.
- **Como:** novo job/cron que, X tempo após `reminder_sent_at` sem confirmação, marca o agendamento como liberado/cancelado. Requer rastrear o estado "confirmado" (item 11).
- **Esforço:** médio.

### 11. CONFIRMAR/CANCELAR não fazem nada estruturado
- **O quê:** a resposta do cliente cai no agente de IA; não há handler que converta "CONFIRMAR" em `appointments.status = 'confirmed'`.
- **Por quê:** sem isso, o item 10 não tem como saber quem confirmou.
- **Como:** detectar a intenção (palavra-chave no webhook **ou** uma tool `confirmAppointment` que a IA chama) e atualizar `appointments.status`.
- **Esforço:** médio.

### 12. Pós-venda / feedback não existe
- **O quê:** o "como está seu cabelo pós-mechas" (R5.3) não está implementado; só há o dispatcher de **reengajamento** de inativos (outra coisa).
- **Por quê:** regra do manual não cumprida.
- **Como:** job que, N dias após um atendimento concluído, dispara a mensagem de feedback no tom da Cathe.
- **Esforço:** médio.

---

## 🟨 Robustez — regras só no prompt (sem enforcement)

### 13. Janela química de 7 dias
- **O quê:** a regra está no prompt, mas nenhuma tool checa o histórico do cliente para bloquear coloração de raiz < 7 dias após selagem/progressiva/botox.
- **Por quê:** depende 100% do LLM lembrar e calcular datas — falha silenciosa.
- **Como:** lógica/tool que consulta atendimentos recentes (já há `recentServices` do Trinks) e bloqueia/avisa antes do `addAppointment`.
- **Esforço:** médio.

### 14. Restrição de sábado para cliente nova (serviços longos)
- **O quê:** prompt-only, sem enforcement (e hoje inócua, pois não há sábado na agenda — item 7). Serviços: Reflexo, Mechas, Luzes, Morena Iluminada, Devolução de Contraste.
- **Por quê:** sem checagem, a IA pode agendar contra a regra.
- **Como:** validação no fluxo de agendamento (combina com itens 6/7).
- **Esforço:** médio.

### 15. Scripts longos vs. "máximo 2 frases"
- **O quê:** o prompt-base obriga "máx. 2 frases, sem markdown"; o manual tem scripts longos (boas-vindas, confirmação).
- **Por quê:** tensão direta → a IA pode **encurtar** o cadastro e pular aniversário/endereço ou a pergunta de origem.
- **Como:** reconciliar — permitir exceção de tamanho para os scripts oficiais, ou mover esses scripts para etapas explícitas do fluxo.
- **Esforço:** baixo a médio.

---

## ⚪ A verificar

### 16. Nome do salão "Spettacolo Salone" × "Cris Ferreira"
- **O quê:** o registro do salão se chama "Spettacolo Salone"; o manual e a persona são "Cris Ferreira".
- **Por quê:** se for produção, é inconsistência de marca (o lembrete usa `salon.name` → manda "salão Spettacolo Salone"). Se for salão de teste, ok.
- **Como:** confirmar se é teste ou produção; se produção, alinhar o nome.

### 17. Base de conhecimento (RAG) vazia — *observação, não necessariamente bug*
- **O quê:** `agent_knowledge_base` está vazia; o manual inteiro vive no `agents.system_prompt`.
- **Por quê:** funciona, mas o prompt fica grande e sem busca semântica; mudanças no manual exigem editar o prompt.
- **Como:** opcional — migrar partes do manual para RAG se o prompt crescer demais.

---

## Sugestão de ordem de ataque

1. **Baratos e de impacto imediato:** itens **1, 2, 4** (e **5** no curto prazo).
2. **Investigar e fechar:** item **3** (Bloqueio de Horário) e item **16** (nome do salão).
3. **Outbound (alinhar à marca):** item **9**, depois **11 → 10 → 12**.
4. **Robustez de regras:** itens **13, 14, 15**.
5. **Features estruturais (planejar):** itens **6, 7, 8**.
