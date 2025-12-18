import Chat from '@/app/api/webhook/whatsapp/teste';

export default function TesteChatPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4">
      <div className="container mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Teste de Chat - Tools WhatsApp
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Teste as tools do webhook do WhatsApp. As tools são executadas automaticamente no servidor.
          </p>
        </div>
        <div className="border rounded-lg p-6 bg-white dark:bg-gray-800 shadow-lg">
          <Chat />
        </div>
      </div>
    </div>
  );
}

