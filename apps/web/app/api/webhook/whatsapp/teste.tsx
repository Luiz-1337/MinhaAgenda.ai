'use client';

import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai';
import { useState } from 'react';

export default function Chat() {
  const { messages, sendMessage, addToolOutput } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),

    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

    // Tools são executadas automaticamente no servidor, não precisam de handlers client-side
    async onToolCall({ toolCall }) {
      // Check if it's a dynamic tool first for proper type narrowing
      if (toolCall.dynamic) {
        return;
      }
      // As tools do route.ts são executadas automaticamente no servidor
      // Não precisamos de handlers client-side aqui
    },
  });
  const [input, setInput] = useState('');

  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 mb-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
        {messages && messages.length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            <p>Envie uma mensagem para começar a testar as tools!</p>
            <p className="text-sm mt-2">Exemplo: &quot;Quais serviços vocês oferecem?&quot;</p>
          </div>
        )}
        {messages?.map(message => (
          <div 
            key={message.id} 
            className={`flex flex-col gap-2 ${
              message.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border'
              }`}
            >
              <div className="text-xs font-semibold mb-1 opacity-70">
                {message.role === 'user' ? 'Você' : 'Assistente'}
              </div>
              {message.parts.map((part, idx) => {
                switch (part.type) {
                  // render text parts as simple text:
                  case 'text':
                    return (
                      <div key={idx} className="whitespace-pre-wrap">
                        {part.text}
                      </div>
                    );

                  // Tool parts - renderização genérica para todas as tools do route.ts
                  default:
                    if (part.type.startsWith('tool-') && 'toolCallId' in part && 'state' in part) {
                      const toolName = part.type.replace('tool-', '');
                      const callId = part.toolCallId;

                      switch (part.state) {
                        case 'input-streaming':
                          return (
                            <div key={callId} className="text-sm italic text-gray-500 dark:text-gray-400">
                              ⚙️ Executando {toolName}...
                            </div>
                          );
                        case 'input-available':
                          return (
                            <div key={callId} className="text-sm italic text-gray-500 dark:text-gray-400">
                              ⚙️ Processando {toolName}...
                            </div>
                          );
                        case 'output-available':
                          return (
                            <div key={callId} className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded text-sm">
                              <div className="font-semibold text-xs text-gray-600 dark:text-gray-300 mb-1">
                                ✓ {toolName}
                              </div>
                              <pre className="text-xs whitespace-pre-wrap break-words">
                                {'output' in part && typeof part.output === 'string' 
                                  ? part.output 
                                  : 'output' in part
                                  ? JSON.stringify(part.output, null, 2)
                                  : 'Sem resultado'}
                              </pre>
                            </div>
                          );
                        case 'output-error':
                          return (
                            <div key={callId} className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm">
                              <div className="font-semibold text-xs text-red-600 dark:text-red-400 mb-1">
                                ✗ Erro em {toolName}
                              </div>
                              <div className="text-red-700 dark:text-red-300 text-xs">
                                {'errorText' in part ? part.errorText : 'Erro desconhecido'}
                              </div>
                            </div>
                          );
                      }
                    }
                    return null;
                }
              })}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage({ text: input });
            setInput('');
          }
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Digite sua mensagem..."
          className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}