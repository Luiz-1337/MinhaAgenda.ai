#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import OpenAI from "openai";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import dotenv from "dotenv";
import { db, salons, eq } from "@repo/db";

dotenv.config();

// ============================================================================
// FUNÇÕES UTILITÁRIAS PARA BUSCA DE SALÃO
// ============================================================================

/**
 * Sanitiza o número de WhatsApp removendo espaços, traços, parênteses e prefixos
 * @param whatsapp - Número de WhatsApp a ser sanitizado
 * @returns Número sanitizado apenas com dígitos e sinal de + (se presente no início)
 */
function sanitizeWhatsApp(whatsapp: string): string {
  return whatsapp
    .trim()
    .replace(/^whatsapp:/i, "") // Remove prefixo "whatsapp:" (case-insensitive)
    .replace(/\s/g, "") // Remove todos os espaços
    .replace(/-/g, "") // Remove todos os traços
    .replace(/\(/g, "") // Remove parênteses de abertura
    .replace(/\)/g, ""); // Remove parênteses de fechamento
}

/**
 * Busca o ID do salão baseado no número de WhatsApp
 * @param whatsapp - Número de WhatsApp do salão (pode conter espaços, traços, parênteses)
 * @returns O ID do salão (UUID) ou null se não encontrado
 * @throws {Error} Se ocorrer um erro na consulta ao banco de dados
 */
async function getSalonIdByWhatsapp(
  whatsapp: string
): Promise<string | null> {
  // Sanitiza o número de WhatsApp para garantir o match
  const sanitizedWhatsapp = sanitizeWhatsApp(whatsapp);

  // Valida se o número sanitizado não está vazio
  if (!sanitizedWhatsapp) {
    return null;
  }

  try {
    // Busca o salão pelo número de WhatsApp sanitizado
    const salon = await db.query.salons.findFirst({
      where: eq(salons.whatsapp, sanitizedWhatsapp),
      columns: { id: true },
    });

    // Retorna o ID se encontrado, caso contrário retorna null
    return salon?.id ?? null;
  } catch (error) {
    // Re-lança o erro com contexto adicional
    throw new Error(
      `Erro ao buscar salão por WhatsApp: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// CONFIGURAÇÃO: Caminho para o seu servidor MCP
const SERVER_COMMAND = "node";
const SERVER_ARGS = ["--import", "tsx", "packages/mcp-server/src/index.ts"]; 

// Inicializa OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

if (!process.env.DATABASE_URL) {
  console.warn("⚠️  Aviso: DATABASE_URL não encontrada nas variáveis de ambiente. O servidor pode falhar.");
} else {
  console.log("✅ DATABASE_URL encontrada.");
}

// --- FUNÇÃO DE LIMPEZA DE SCHEMA PARA OPENAI ---
function sanitizeSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;

  // Clona para não mutar o original
  const clean = { ...schema };

  // Remove campos que a OpenAI não suporta
  delete clean.$schema;
  delete clean.title;
  delete clean.default; 
  delete clean.additionalProperties; 

  // Correção 1: Arrays sem items (inclusive quando type é lista de tipos)
  const isArrayType = clean.type === 'array' || (Array.isArray(clean.type) && clean.type.includes('array'));
  
  if (isArrayType) {
      if (!clean.items) {
         clean.items = { type: 'string' }; // Fallback
      }
      // Se items for array (tuple schema), converte para single schema ou garante que todos estão sanitizados
      if (Array.isArray(clean.items)) {
          clean.items = clean.items.map((i: any) => sanitizeSchema(i));
      } else {
          clean.items = sanitizeSchema(clean.items);
      }
  }

  // Correção 2: Recursão em properties
  if (clean.properties) {
    const newProps: any = {};
    for (const [key, val] of Object.entries(clean.properties)) {
      newProps[key] = sanitizeSchema(val);
    }
    clean.properties = newProps;
  }

  // Correção 3: Recursão em anyOf/oneOf/allOf
  ['anyOf', 'oneOf', 'allOf'].forEach(key => {
    if (Array.isArray(clean[key])) {
      clean[key] = clean[key].map((item: any) => sanitizeSchema(item));
    }
  });

  // Correção 4: Zod .describe() muitas vezes coloca 'description' em lugares que conflitam ou duplicam
  // A OpenAI gosta de description, então mantemos.

  return clean;
}

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
        // DEBUG: Imprimir schema original se for o problemático
        if (tool.name === 'saveCustomerPreference') {
            console.log("🔍 Schema Original saveCustomerPreference:", JSON.stringify(tool.inputSchema, null, 2));
        }

        const sanitized = sanitizeSchema(tool.inputSchema);

        if (tool.name === 'saveCustomerPreference') {
            console.log("✨ Schema Sanitizado saveCustomerPreference:", JSON.stringify(sanitized, null, 2));
        }

        return {
            type: "function" as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: sanitized,
            },
        };
    });

    console.log(`🛠️  ${openaiTools.length} ferramentas carregadas.`);

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

    console.log("\n✅ Contexto configurado!");
    console.log(`   WhatsApp do Salão: ${salonWhatsapp.trim()}`);
    console.log(`   Salão ID: ${salonId}`);
    console.log(`   Telefone: ${phoneNumber.trim()}`);
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
- Use essa data como referência absoluta para calcular termos relativos como "amanhã" ou "sábado que vem".

CONTEXTO IMPORTANTE:
- ID do Salão: ${salonId}
- Número de Telefone do Cliente: ${phoneNumber.trim()}

Ao usar as ferramentas MCP, SEMPRE forneça o salonId como "${salonId}" e o phone como "${phoneNumber.trim()}" quando necessário. 
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
            model: "gpt-4o", // ou gpt-3.5-turbo
            messages: messages,
            tools: openaiTools.length > 0 ? openaiTools : undefined,
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
