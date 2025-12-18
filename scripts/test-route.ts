/**
 * Script para testar o route.ts do webhook WhatsApp
 * 
 * Uso: npx tsx scripts/test-route.ts "sua mensagem aqui"
 */

import { UIMessage } from 'ai';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const ENDPOINT = `${API_URL}/api/webhook/whatsapp`;

async function testRoute(message: string) {
  console.log(`\n🧪 Testando route.ts com mensagem: "${message}"\n`);

  const messages: UIMessage[] = [
    {
      id: '1',
      role: 'user',
      parts: [{ type: 'text', text: message }],
    },
  ];

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Erro ${response.status}: ${errorText}`);
      return;
    }

    console.log('✅ Resposta recebida. Processando stream...\n');

    // Processa o stream de resposta
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      console.error('❌ Não foi possível ler o stream de resposta');
      return;
    }

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      // Processa linhas completas
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('0:')) {
          // Mensagem de texto
          const data = line.slice(2);
          if (data) {
            process.stdout.write(data);
          }
        } else if (line.startsWith('2:')) {
          // Tool call
          try {
            const toolData = JSON.parse(line.slice(2));
            console.log(`\n🔧 Tool: ${toolData.toolName}`);
          } catch (e) {
            // Ignora erros de parsing
          }
        }
      }
    }

    console.log('\n\n✅ Teste concluído!\n');
  } catch (error) {
    console.error('❌ Erro ao testar:', error);
    if (error instanceof Error) {
      console.error('Detalhes:', error.message);
    }
  }
}

// Pega a mensagem dos argumentos da linha de comando
const message = process.argv[2] || 'Quais serviços vocês oferecem?';

testRoute(message);

