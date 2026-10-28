# Como alimentar a IA na aba Treinamentos

**MinhaAgenda.ai** | Guia para donos e gerentes de salão | Atualizado em outubro de 2026

Este guia explica como cadastrar no **Treinamento** o que a sua IA precisa saber para responder aos clientes no WhatsApp: o que colocar ali, como escrever cada item para a IA encontrar na hora certa e como testar se funcionou.

**Neste guia**

1. Como a IA usa o que você cadastra
2. Treinamento ou Instruções do Agente?
3. O que cadastrar em cada lugar
4. Passo a passo na tela
5. Como escrever um bom item
6. Modelos prontos para adaptar
7. Enviando arquivos (PDF ou TXT)
8. Como testar
9. Problemas comuns
10. Checklist antes de salvar

## Resumo rápido

- O **Treinamento** é a memória de consulta da sua IA: dúvidas frequentes, políticas, cuidados, como chegar, o que o salão faz e o que não faz.
- A IA **não lê o Treinamento inteiro a cada mensagem**. Para cada mensagem do cliente, o sistema procura os itens que têm a ver com o que ele escreveu e entrega à IA **no máximo 5**.
- Por isso: **um assunto por item**, escrito **com as palavras que o cliente usaria**.
- Regra que precisa valer **sempre** (tom de voz, saudação, jeito de passar preço) não vai no Treinamento: vai nas **Instruções do Agente**.
- Preço, duração, horários, equipe e endereço a IA já busca nas outras telas do painel. Não repita no Treinamento.

## 1. Como a IA usa o que você cadastra

Pense no Treinamento como um fichário, em que cada item é uma ficha. Quando um cliente manda mensagem no WhatsApp:

1. O sistema pega a **última mensagem** do cliente. Mensagem de voz também vale: o áudio é transcrito em texto.
2. Compara o **sentido** dessa mensagem com cada ficha do fichário.
3. Separa as fichas **mais parecidas**, no máximo 5. Se nenhuma for parecida o bastante, nenhuma vai.
4. Entrega essas fichas à IA, junto com as Instruções do Agente, e a IA escreve a resposta.

Isso tem três consequências práticas:

- **Ficha que mistura assuntos se perde.** Um texto que fala de estacionamento, pagamento e crianças fica meio parecido com tudo e muito parecido com nada. Quando o cliente pergunta do estacionamento, uma ficha só sobre estacionamento é encontrada com muito mais facilidade.
- **As palavras do cliente contam.** A busca é por sentido, não por palavra exata, mas uma ficha que já traz o jeito como o cliente pergunta ("onde eu paro o carro?") é encontrada com mais facilidade.
- **Cada ficha precisa se explicar sozinha.** A IA recebe só as fichas encontradas. Um texto como "isso também vale para o item anterior" não funciona, porque o item anterior pode não ter vindo junto.

### Quem manda mais

- O Treinamento entra como instrução do salão, com a mesma força das Instruções do Agente. **Se um item contradisser as Instruções do Agente, a IA segue as Instruções.**
- Nenhum dos dois passa por cima das travas de segurança da IA: ela sempre consulta a agenda antes de oferecer um horário, não inventa preço, serviço ou profissional e nunca mostra códigos internos ao cliente.

### O Treinamento pertence a um agente

- Cada agente tem o seu próprio Treinamento. Só o agente marcado como **Ativo** atende no WhatsApp (ativar um agente desativa os outros).
- **Duplicar agente** copia as configurações e as instruções, **mas não copia o Treinamento**. Se trocar de agente, cadastre o Treinamento no agente novo.

## 2. Treinamento ou Instruções do Agente?

O painel tem dois lugares para ensinar a IA, e cada um funciona de um jeito:

| | Instruções do Agente | Treinamento |
|----------------|-----------------------------|-----------------------------|
| Onde fica | Agentes AI > botão de três pontinhos > Editar detalhes | Agentes AI > Treinamentos |
| Quando a IA lê | Em **toda** mensagem | Só quando a mensagem tem a ver com o item |
| Serve para | O **jeito** de atender | O **conteúdo** que responde a uma dúvida |
| Exemplos | Tom de voz, saudação, como passar preço, quantos horários oferecer, frases prontas | Políticas, cuidados, como chegar, formas de pagamento, o que o salão não faz |
| Em caso de conflito | Vale esta | Perde para as Instruções |

**Regra de bolso:** se a regra precisa valer em qualquer conversa, ela vai nas **Instruções**. Se é a resposta para uma pergunta específica, vai no **Treinamento**.

Exemplo: "Nunca informe a duração dos serviços" precisa valer quando o cliente pergunta "quanto custa a escova?", uma pergunta que não se parece em nada com a regra. No Treinamento, essa regra quase nunca seria encontrada. O lugar dela é nas Instruções do Agente.

Por que não colocar tudo nas Instruções? Porque elas vão em toda mensagem: quanto mais longas, mais texto a IA processa a cada resposta (e mais créditos consome), e mais o essencial se dilui. O Treinamento existe para o conhecimento que só importa quando o assunto aparece.

## 3. O que cadastrar em cada lugar

A IA já busca sozinha as informações abaixo nas outras telas do painel. Mantenha cada informação **em um lugar só**: se o Treinamento disser um valor e a tela disser outro, a IA fica com duas versões e pode responder qualquer uma delas.

| Informação | Onde cadastrar |
|--------------------------------------------|---------------------------|
| Serviços, preços, duração, dias e horários em que cada serviço é feito | **Serviços** |
| Profissionais e o que cada um faz | **Equipe** |
| Produtos à venda e seus preços | **Produtos** |
| Endereço, telefone, horário de funcionamento, política de cancelamento, tolerância de atraso, taxa de confirmação via Pix, se aceita cartão e se tem estacionamento | **Configurações do Salão** (clique no seu nome, no canto superior direito > Configurações > Configurações do Salão) |
| Tom de voz, saudação, formato das respostas, regras que valem sempre | **Instruções do Agente** |
| Dúvidas frequentes, políticas detalhadas, cuidados antes e depois dos serviços, como chegar, detalhes do estacionamento e das formas de pagamento, o que o salão não faz | **Treinamento** |

> **Cartão e estacionamento.** Ligue as chaves "Aceita Cartão" e "Estacionamento" nas Configurações do Salão e a IA passa a saber que o salão aceita cartão de crédito e débito e que tem estacionamento próprio.\
> Chave desligada não vira um "não". As duas já vêm desligadas, então a IA não tem como saber se o salão não tem ou se ninguém mexeu na chave. Se o salão **não** aceita cartão ou **não** tem estacionamento e você quer que a IA diga isso, escreva no Treinamento.\
> Os detalhes também vão no Treinamento: Pix, parcelamento, onde estacionar, preço da vaga (veja os modelos da seção 6).

## 4. Passo a passo na tela

### Abrir o Treinamento

1. No menu lateral, clique em **Agentes AI**.
2. No cartão do agente **Ativo**, clique em **Treinamentos** (ícone de capelo de formatura; no celular aparece só o ícone).
3. Abre a tela **Treinamentos da IA**, com o nome do agente logo abaixo do título.

### Adicionar um item escrito por você

1. Clique em **Adicionar Conhecimento**.
2. Escreva no campo **Texto do Conhecimento**. Pode usar várias linhas.
3. Clique em **Adicionar**. A mensagem "Conhecimento adicionado com sucesso" confirma.
4. Em até 1 minuto o item já vale para as próximas mensagens.

### Enviar um arquivo

1. Clique em **Enviar Arquivo**.
2. Arraste os arquivos para a área tracejada ou clique em **Selecionar Arquivos**. São aceitos PDF e TXT, e dá para mandar vários de uma vez.
3. Espere aparecer **Concluído** em cada arquivo e clique em **Fechar**.
4. O arquivo aparece na lista em um bloco próprio, dividido em pedaços ("Chunk 1/5", "Chunk 2/5" e assim por diante). Antes de enviar, leia a seção 7.

### Corrigir ou apagar

- **Não existe botão de editar.** Para corrigir um item: copie o texto dele, clique em **Adicionar Conhecimento**, cole, corrija e salve. Depois apague o item antigo.
- Para apagar um item: clique na **lixeira** ao lado dele e confirme em **Remover**.
- Para apagar um arquivo inteiro: clique em **Remover Arquivo**, no topo do bloco do arquivo. Isso apaga todos os pedaços dele.
- Apagar não tem volta.

## 5. Como escrever um bom item

### As 7 regras

1. **Um assunto por item.** Estacionamento é um item; formas de pagamento é outro.
2. **Comece dizendo o assunto.** Por exemplo: "Assunto: Estacionamento".
3. **Inclua como o cliente pergunta.** Duas ou três formas diferentes: "tem estacionamento?", "onde eu paro o carro?".
4. **Escreva a resposta completa**, com números, condições e exceções. "Temos 2 vagas na frente; se estiverem ocupadas, há um estacionamento pago a 50 metros" é muito melhor que "temos estacionamento".
5. **Faça o item se explicar sozinho.** Nada de "como dito acima" ou "veja o item de pagamento".
6. **Seja breve:** de 2 a 6 frases. Se precisar de mais, provavelmente são dois assuntos.
7. **Uma versão por assunto.** Mudou a regra? Apague o item antigo. Dois itens sobre o mesmo assunto, com informações diferentes, fazem a IA responder ora um, ora outro.

### Modelo

Use este formato em todo item:

> Assunto: [nome do assunto]\
> O cliente pode perguntar: "[pergunta 1]", "[pergunta 2]", "[pergunta 3]"\
> Resposta: [a informação completa, em 2 a 6 frases]

Os dados dos exemplos deste guia são fictícios: troque pelos do seu salão.

### Do jeito errado ao jeito certo

**Errado:** tudo num item só.

> Somos um salão desde 2010, temos estacionamento, aceitamos Pix e cartão, não atendemos crianças menores de 5 anos, depois da progressiva não pode lavar por 3 dias e quem atrasar mais de 15 minutos precisa remarcar.

Por que não funciona: são cinco assuntos. Quando o cliente pergunta do estacionamento, esse texto pode nem ser encontrado, e quando é, chega com quatro assuntos que não interessam. Além disso, a tolerância de atraso já está nas Configurações do Salão: se um dia mudar lá, este item fica desatualizado.

**Certo:** um item por assunto. Dois deles:

> Assunto: Estacionamento\
> O cliente pode perguntar: "tem estacionamento?", "onde eu paro o carro?", "tem vaga pra carro?"\
> Resposta: Temos 2 vagas exclusivas em frente ao salão. Se estiverem ocupadas, o Estacionamento Central fica a 50 metros, na esquina com a Rua das Flores (cerca de R$ 10 por hora; não temos convênio).

> Assunto: Lavar o cabelo depois da progressiva\
> O cliente pode perguntar: "quando posso lavar o cabelo?", "quanto tempo fico sem lavar?", "posso prender o cabelo depois da progressiva?"\
> Resposta: Depois da progressiva, espere 72 horas para lavar o cabelo e não o prenda nem use boné nesse período. Na primeira lavagem, use shampoo sem sal.

Repare que o segundo item já traz a pergunta "quando posso lavar o cabelo?". Assim, mesmo que o cliente escreva só isso, sem falar em progressiva, o item tem boas chances de ser encontrado.

### Quando a frase precisa ser exata

Se você quer que a IA use uma frase exata, diga isso no próprio item, por exemplo: *Resposta: responda exatamente assim: "Não fazemos atendimento a domicílio, mas teremos o maior prazer em receber você aqui no salão."* A IA segue as frases e os formatos que o salão pede.

## 6. Modelos prontos para adaptar

Troque o que está entre colchetes. Cada modelo é um item separado.

### Formas de pagamento

> Assunto: Formas de pagamento\
> O cliente pode perguntar: "aceita cartão?", "posso pagar no Pix?", "dá pra parcelar?"\
> Resposta: Aceitamos [Pix, dinheiro e cartão de débito e crédito]. No crédito, parcelamos em até [3x sem juros] em serviços acima de [R$ 300]. [Não aceitamos cheque.]

Com a chave "Aceita Cartão" ligada, a IA já sabe que o salão aceita cartão. Use este item para o resto: Pix, dinheiro, parcelamento e o que o salão não aceita.

### Como chegar

> Assunto: Como chegar\
> O cliente pode perguntar: "onde fica?", "como chego aí?", "qual o ponto de referência?", "tem metrô perto?"\
> Resposta: Ficamos [em frente à Padaria Central, no 2º andar]. A estação [Vila Nova] do metrô fica a [5 minutos a pé]. [A entrada é pela porta lateral.]

O endereço em si fica nas Configurações do Salão. Aqui vão os pontos de referência e o caminho.

### Atraso

> Assunto: Atraso\
> O cliente pode perguntar: "e se eu atrasar?", "posso chegar um pouco depois?", "vou me atrasar uns minutos"\
> Resposta: Se o atraso passar da tolerância, [fazemos o serviço se a agenda da profissional permitir; se não der, remarcamos sem custo].

Não repita aqui o número de minutos: ele fica nas Configurações do Salão (Tolerância de atraso), e a IA já sabe.

### Atendimento de crianças

> Assunto: Atendimento de crianças\
> O cliente pode perguntar: "atende criança?", "corta cabelo infantil?", "posso levar meu filho?"\
> Resposta: [Atendemos crianças a partir de 5 anos, sempre com um responsável presente. Não fazemos química em menores de 12 anos.]

### Cuidados depois de um procedimento

> Assunto: Cuidados depois da [coloração]\
> O cliente pode perguntar: "quando posso lavar depois de pintar?", "o que não posso fazer depois?", "posso ir à piscina?"\
> Resposta: [Espere 48 horas para a primeira lavagem e use shampoo para cabelos coloridos. Evite piscina e mar por 15 dias.]

Faça um item para cada procedimento que tem cuidados próprios (progressiva, coloração, luzes, alongamento de cílios...).

### Teste de mecha e alergia

> Assunto: Teste de mecha e alergia\
> O cliente pode perguntar: "precisa fazer teste antes?", "tenho alergia a tinta", "já tive reação a tintura, posso fazer?"\
> Resposta: Para [coloração e descoloração], fazemos um teste de mecha [48 horas antes], sem custo. Quem já teve alergia a tintura deve avisar ao agendar [e passa por uma avaliação antes].

### Produtos e marcas que usamos

> Assunto: Produtos e marcas que usamos\
> O cliente pode perguntar: "que marca vocês usam?", "a progressiva tem formol?", "tem opção vegana?"\
> Resposta: Trabalhamos com [marca X e marca Y]. [Nossa progressiva é sem formol.] [Temos hidratação vegana.]

### O que o salão não faz

> Assunto: Serviços que não fazemos\
> O cliente pode perguntar: "vocês fazem mega hair?", "atende em casa?", "faz sobrancelha de henna?"\
> Resposta: Não fazemos [mega hair, atendimento a domicílio e sobrancelha de henna].

Liste o que os clientes costumam pedir e o salão não faz. Assim a IA responde com segurança, em vez de dizer que vai verificar. Se a lista crescer muito, divida em mais de um item.

### Primeira visita

> Assunto: Primeira visita\
> O cliente pode perguntar: "nunca fui aí, como funciona?", "precisa de avaliação?", "é minha primeira vez"\
> Resposta: [Na primeira visita fazemos uma avaliação rápida do cabelo, sem custo, antes do serviço. Chegue 10 minutos antes para o cadastro.]

## 7. Enviando arquivos (PDF ou TXT)

O arquivo é prático quando você já tem o material pronto, como um manual ou uma lista de perguntas frequentes. Mas vale entender o que acontece com ele:

- O sistema extrai o texto e o **corta em pedaços de cerca de 1.000 caracteres** (mais ou menos um parágrafo grande). Cada pedaço vira um item separado na busca: são os "Chunks" que aparecem na tela.
- O corte procura uma quebra de parágrafo, mas **não sabe onde termina cada assunto**. Um pedaço pode começar no fim de um assunto e terminar no meio do próximo.

Para o arquivo funcionar bem:

1. **Organize por assunto**, com um título curto em cada um e uma linha em branco entre os assuntos.
2. **Mantenha cada assunto curto**, com até um parágrafo. Assim cada pedaço fica com um assunto inteiro.
3. **Use o mesmo formato dos itens** (assunto, como o cliente pergunta, resposta). Um arquivo assim vira vários bons itens de uma vez.
4. **Evite tabelas, colunas e imagens.** Tabela vira texto embaralhado, e imagem não é lida.
5. **O PDF precisa ter texto de verdade.** Se você não consegue selecionar as palavras com o mouse, o PDF é uma imagem e o sistema não consegue ler (aparece o erro "Nenhum texto foi encontrado no arquivo"). Nesse caso, digite o conteúdo ou use um TXT.
6. **Word e Google Docs:** salve como PDF ou copie o texto para um arquivo TXT. Só são aceitos .pdf e .txt. O TXT é o mais previsível: o que você escreve é exatamente o que entra.
7. **Tamanho:** a tela aceita até 10 MB, mas prefira arquivos de até 4 MB, porque arquivos maiores podem falhar no envio. PDF pesado quase sempre é pesado por causa das imagens, que não servem para nada aqui.

Depois de enviar:

- Abra o bloco do arquivo e **leia os pedaços**. Apague (na lixeira) os que só têm capa, sumário, rodapé ou número de página.
- **Para atualizar um arquivo**, clique primeiro em **Remover Arquivo** na versão antiga e só depois envie a nova. Se enviar sem remover, as duas versões ficam valendo ao mesmo tempo.

Sempre que der, prefira digitar os itens: assim você controla exatamente o que cada um diz.

## 8. Como testar

O painel ainda não mostra quais itens a IA consultou em cada resposta. O teste é pela própria resposta, no WhatsApp:

1. Depois de salvar, espere 1 minuto. Se você mudou as **Instruções do Agente**, espere até 5 minutos.
2. Do seu celular, mande para o WhatsApp do salão a pergunta **do jeito que um cliente faria**.
3. Teste **duas ou três formas diferentes** da mesma pergunta: "tem estacionamento?", "onde deixo o carro?", "vou de carro, tem vaga?".
4. Se a resposta não usou o item, reescreva-o seguindo a seção 5 (principalmente as regras 1 e 3), salve a versão nova, apague a antiga e teste de novo.
5. Se puder, teste numa conversa nova, de outro número. A IA também lê o histórico da conversa e tende a repetir o jeito como já respondeu antes.

Mensagens de voz funcionam do mesmo jeito: o áudio é transcrito, e a busca usa o texto.

## 9. Problemas comuns

**"A IA não usou o que eu cadastrei."**

- A pergunta do cliente não se parece com o item: reescreva com as palavras do cliente (regra 3).
- O item mistura assuntos: divida em vários (regra 1).
- É uma regra que precisa valer sempre: leve para as Instruções do Agente.
- Você treinou um agente que não está Ativo: confira em Agentes AI qual agente está Ativo.
- O item contradiz as Instruções do Agente: as Instruções vencem. Deixe os dois dizendo a mesma coisa.

**"A IA respondeu uma informação antiga."**

- O item antigo continua cadastrado. Apague-o (lembre: não existe editar, é apagar e adicionar de novo).
- Se a informação veio de um arquivo, remova o arquivo antigo.

**"A IA responde diferente a cada vez."**

- Há dois itens sobre o mesmo assunto com informações diferentes, ou um item que contradiz as Instruções do Agente. Deixe uma versão só.

**"O preço (ou o horário) que a IA passou não é o do Treinamento."**

- Preço, duração e horários vêm das telas Serviços, Equipe e Agenda. Corrija lá e tire essa informação do Treinamento.

**"Deu erro ao enviar o arquivo."**

- Só são aceitos arquivos .pdf e .txt.
- PDF escaneado (uma foto do documento) não tem texto para ler.
- Arquivo grande: tente um menor, de até 4 MB.

## 10. Checklist antes de salvar

- [ ] Fala de **um assunto só**?
- [ ] Começa dizendo **qual é o assunto**?
- [ ] Traz **as palavras que o cliente usaria**?
- [ ] Faz sentido **lido sozinho**?
- [ ] Tem a informação **completa**, com números, condições e exceções?
- [ ] **Não repete** preço, duração, horário, equipe ou endereço?
- [ ] **Não contradiz** as Instruções do Agente nem outro item?
- [ ] É algo que só importa **quando o assunto aparece**? (Se precisa valer sempre, vai nas Instruções do Agente.)

### Por onde começar

Abra **Conversas**, leia as últimas conversas e anote as perguntas que a IA não soube responder, ou que a recepção responde toda semana. Comece por essas 10 a 20 perguntas: cada uma vira um item.
