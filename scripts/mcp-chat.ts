#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import OpenAI from "openai";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import dotenv from "dotenv";
import { getSalonIdByWhatsapp, getClientIdByPhoneNumber, getDataFromClient } from "./mcp-chat-utils.js";

dotenv.config();

// CONFIGURAÇÃO: Caminho para o seu servidor MCP
const SERVER_COMMAND = "node";
const SERVER_ARGS = ["--import", "tsx", "packages/mcp-server/src/index.ts"]; 

// Inicializa OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  console.log("🔌 Conectando ao Servidor MCP...");

  // 1. Conectar ao Servidor MCP
  const transport = new StdioClientTransport({
    command: SERVER_COMMAND,
    args: SERVER_ARGS,
    env: Object.fromEntries(
        Object.entries(process.env).filter(([_, v]) => typeof v === "string")
      ) as Record<string, string>
  });

  const mcpClient = new Client(
    { name: "mcp-openai-chat", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    await mcpClient.connect(transport);
    console.log("✅ MCP Conectado!");

    // 2. Buscar ferramentas disponíveis e converter para formato OpenAI
    const toolsList = await mcpClient.listTools();
    
    const openaiTools = toolsList.tools.map((tool) => {
        return {
            type: "function" as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
            },
        };
    });

    console.log(`🛠️  ${openaiTools.length} ferramentas carregadas.`);

    for (const tool of openaiTools) {
      console.log(`🛠️  ${tool.function.name}: ${tool.function.description}`);
      console.log(`   > Schema: ${JSON.stringify(tool.function.parameters, null, 2)}`);
    }

    // Solicita informações de contexto antes de iniciar o chat
    const rl = readline.createInterface({ input: stdin, output: stdout });
    
    console.log("\n📋 Por favor, forneça as seguintes informações para configurar o contexto:\n");
    
    const salonWhatsapp = await rl.question("Número de WhatsApp do Salão: ");
    if (!salonWhatsapp || salonWhatsapp.trim() === "") {
      console.error("❌ Número de WhatsApp do salão é obrigatório. Encerrando...");
      rl.close();
      await mcpClient.close();
      process.exit(1);
    }

    // Busca o ID do salão pelo número de WhatsApp
    console.log("🔍 Buscando salão pelo número de WhatsApp...");
    const salonId = await getSalonIdByWhatsapp(salonWhatsapp.trim());
    
    if (!salonId) {
      console.error(`❌ Salão não encontrado para o número: ${salonWhatsapp.trim()}`);
      console.error("   Verifique se o número está correto e se o salão está cadastrado no sistema.");
      rl.close();
      await mcpClient.close();
      process.exit(1);
    }
    
    console.log(`✅ Salão encontrado! ID: ${salonId}`);

    const phoneNumber = await rl.question("Número de Telefone do Cliente: ");
    if (!phoneNumber || phoneNumber.trim() === "") {
      console.error("❌ Número de telefone é obrigatório. Encerrando...");
      rl.close();
      await mcpClient.close();
      process.exit(1);
    }

    const clientId = await getClientIdByPhoneNumber(phoneNumber.trim());
    if (!clientId) {
      console.error("❌ Cliente não encontrado. Encerrando...");
      rl.close();
      await mcpClient.close();
      process.exit(1);
    }

    console.log(`✅ Cliente encontrado! ID: ${clientId}`);

    console.log("\n✅ Contexto configurado!");
    console.log(`   WhatsApp do Salão: ${salonWhatsapp.trim()}`);
    console.log(`   Salão ID: ${salonId}`);
    console.log(`   Telefone: ${phoneNumber.trim()}`);

    const client = await getDataFromClient(clientId);

    console.log(`✅ Preferências do cliente: ${JSON.stringify(client.preferences, null, 2)}`);
    console.log(`✅  Informações do Cliente: ${JSON.stringify(client.salonCustomers, null, 2)}`)
    console.log("\n💬 Chat iniciado! Digite sua mensagem (ou 'sair'):\n");

    // Obtém data e hora atual em pt-BR com timezone America/Sao_Paulo
    const now = new Date();
    const timeZone = 'America/Sao_Paulo';
    
    // Formata a data com dia da semana (ex: "quarta-feira, 10 de dezembro de 2025")
    const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const formattedDate = dateFormatter.format(now);
    
    // Formata a hora como HH:mm
    const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const formattedTime = timeFormatter.format(now);

    // Histórico de conversas com contexto
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { 
        role: "system", 
        content: `Você é um assistente útil conectado a ferramentas via MCP para gerenciar agendamentos de um salão.

CONTEXTO TEMPORAL:
- HOJE É: ${formattedDate}
- HORA ATUAL: ${formattedTime}
- As preferências do cliente são: ${JSON.stringify(client.preferences, null, 2)}
- O Nome do Cliente é: ${client.fullName}
- O ID do Cliente é: ${clientId}
- Informações do Cliente: ${JSON.stringify(client.salonCustomers, null, 2)}
- Use essa data como referência absoluta para calcular termos relativos como "amanhã" ou "sábado que vem".

CONTEXTO IMPORTANTE:
- ID do Salão: ${salonId}
- Número de Telefone do Cliente: ${phoneNumber.trim()}

REGRAS CRÍTICAS:
1. NUNCA invente ou assuma informações sobre profissionais, serviços ou disponibilidade.
2. SEMPRE use as ferramentas MCP disponíveis antes de responder sobre:
   - Profissionais (use getProfessionals)
   - Serviços (use getServices)
   - Disponibilidade (use checkAvailability ou getProfessionalAvailabilityRules)
   - Agendamentos (use getMyFutureAppointments ou getCustomerUpcomingAppointments)
3. Se uma ferramenta retornar vazia ou erro, diga claramente que não encontrou a informação solicitada.
4. NUNCA mencione profissionais, serviços ou horários que não foram retornados pelas ferramentas.
5. Se o usuário perguntar sobre algo que você não tem certeza, use a ferramenta apropriada primeiro.

Ao usar as ferramentas MCP, SEMPRE forneça o salonId como "${salonId}" e o clientId como "${clientId}" quando necessário. 
Use essas informações automaticamente ao chamar as ferramentas, não peça ao usuário por esses valores.` 
      }
    ];

    // 3. Loop do Chat
    while (true) {
      const userInput = await rl.question("Você: ");
      
      if (userInput.toLowerCase() === "sair") break;

      // Adiciona pergunta do usuário ao histórico
      messages.push({ role: "user", content: userInput });

      try {
        // Chama a OpenAI (pode rodar em loop se ela decidir chamar várias ferramentas)
        let keepProcessing = true;

        while (keepProcessing) {
          process.stdout.write("🤖 Pensando...");
          
          const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            tools: openaiTools,
            tool_choice: "auto",
          });

          // Limpa a linha do "Pensando..."
          if (process.stdout.isTTY) {
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
          } else {
             process.stdout.write("\n");
          }

          const responseMessage = response.choices[0].message;
          messages.push(responseMessage); // Guarda a resposta

          // Verifica se a IA quer chamar alguma ferramenta
          if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
            console.log("\n⚙️  A IA decidiu usar ferramentas...");

            for (const toolCall of responseMessage.tool_calls) {
              if (toolCall.type === 'function' && toolCall.function) {
                const toolName = toolCall.function.name;
                const toolArgs = JSON.parse(toolCall.function.arguments);

                console.log(`   > Executando: ${toolName}`);
                console.log(`   > Args: ${JSON.stringify(toolArgs, null, 2)}`);

                try {
                  // Executa a ferramenta no servidor MCP
                  const result = await mcpClient.callTool({
                    name: toolName,
                    arguments: toolArgs,
                  });

                  // Converte o resultado do MCP para string para a OpenAI ler
                  const toolResultContent = Array.isArray(result.content)
                    ? (result.content as Array<{ type: string; text?: string }>)
                        .map((c) => c && c.type === 'text' ? c.text ?? "" : JSON.stringify(c))
                        .join("\n")
                    : typeof result.content === "string"
                        ? result.content
                        : JSON.stringify(result.content);

                  // Devolve o resultado para a IA
                  messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: toolResultContent,
                  });
                  
                  console.log(`   > Resultado enviado.`);
                } catch (toolError) {
                  console.error(`   > Erro ao executar ferramenta ${toolName}:`, toolError);
                  messages.push({
                      role: "tool",
                      tool_call_id: toolCall.id,
                      content: `Erro ao executar ferramenta: ${toolError instanceof Error ? toolError.message : String(toolError)}`
                  });
                }
              }
            }
            // O loop continua
          } else {
            // Se não houve chamada de ferramenta, é a resposta final
            console.log(`\n🤖 IA: ${responseMessage.content}\n`);
            keepProcessing = false;
          }
        }

      } catch (error: any) {
         if (process.stdout.isTTY) {
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
         }
        console.error("❌ Erro na OpenAI:", error.message);
        if (error.error?.code === 'invalid_function_parameters') {
            console.error("🔍 Detalhe do erro de schema:", JSON.stringify(error.error, null, 2));
        }
      }
    }

    rl.close();
    await mcpClient.close();
  } catch (err) {
      console.error("Erro fatal ao iniciar cliente MCP:", err);
  }
}

main();
